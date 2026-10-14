const cheerio = require("cheerio");
const { withCamoufoxSession } = require("../../common/get-page-with-camoufox");
const {
  isBunnyShieldChallengeFetchResponse,
} = require("../../common/bot-challenge");
const { basicNormalize, fetchWithRetry, getId } = require("../../common/utils");
const {
  getWebEventId,
  retrieveEventBooking,
} = require("../../common/spektrix");
const { id, domain } = require("./attributes");

const spektrixClient = "jw3";

// JW3 sits behind Bunny Shield, which on 14th October 2026 began challenging
// the runner with a proof-of-work page that only a browser can complete. A
// plain fetch either got the challenge or, following its redirects without
// keeping the cookie they set, gave up with "redirect count exceeded". So each
// page is tried cheaply first and the session escalates to Camoufox at the
// first challenge, as Close-Up's does - see `withoutBrowser` in
// `common/get-page-with-camoufox.js`. The Spektrix calls are another host and
// stay on fetch.
//
// The site search form is in the header of every JW3 page, listing and event
// alike, and a challenge page can't carry it - so it is what tells the real
// page apart, and what the browser waits for while the challenge clears. The
// listing's own cards can't do that job: a page past the end of the listing
// has none.
const PAGE_SELECTOR = "#zoekForm";

// One cache entry per page, so a rerun after a failure part-way through
// resumes rather than paying for every page again - which matters once each
// costs a browser load. The hash keeps the key unique; the slug keeps the cache
// directory readable.
const getCacheKey = (url) => {
  const slug = new URL(url).pathname.split("/").filter(Boolean).pop();
  return `${id}-${getId(url)}-${slug}`;
};

// Returns the page HTML, or null when the request was challenged - which tells
// the session to escalate to the browser. Redirects aren't followed: JW3's own
// pages don't redirect, and following the challenge's would loop without the
// cookie it sets, so a redirect goes to the browser too. Anything else (a 404,
// a 500) throws, because escalating wouldn't help.
const fetchWithoutBrowser = async (url) => {
  const response = await fetchWithRetry(url, { redirect: "manual" });
  if (isBunnyShieldChallengeFetchResponse(response)) return null;
  if (response.status >= 300 && response.status < 400) return null;
  if (!response.ok) {
    throw new Error(`Unexpected ${response.status} response for ${url}`);
  }

  const html = await response.text();
  return cheerio.load(html)(PAGE_SELECTOR).length > 0 ? html : null;
};

const readPageWithBrowser = async (page) => {
  await page.waitForSelector(PAGE_SELECTOR, { state: "attached" });
  return page.content();
};

const getPageContent = (getPage, url) =>
  getPage(url, getCacheKey(url), readPageWithBrowser, {
    withoutBrowser: fetchWithoutBrowser,
  });

// JW3 pages its listing with `p54_page` - the 54 is the id of the page part
// holding the listing - and ignores `page`, answering it with page 1 whatever
// the number. Without `list_type=events` the listing is one card per film.
const getSearchUrl = (page) =>
  `${domain}/whats-on?genres[]=19&max=27&p54_page=${page}`;

// A "Tickets" link to another site. JW3's own pages only ever link "Tickets"
// to its relative `/tickets-...` information page.
const getExternalBookingUrl = (listing) => {
  const $ = cheerio.load(listing);
  const { hostname } = new URL(domain);
  return $("a")
    .filter((i, el) => basicNormalize($(el).text()) === "tickets")
    .map((i, el) => $(el).attr("href"))
    .get()
    .find((href) => {
      if (!/^https?:\/\//i.test(href)) return false;
      return new URL(href).hostname !== hostname;
    });
};

async function retrieveListings(getPage) {
  const movieListPages = [];
  const urls = new Set();
  let page = 1;
  while (true) {
    const searchResults = await getPageContent(getPage, getSearchUrl(page));
    const $ = cheerio.load(searchResults);
    const urlsOnPage = $(".eventCard .thumb a")
      .map((i, el) => $(el).attr("href"))
      .get();
    // An empty page past the first is the end of the listing. An empty first
    // page is not a programme with nothing on - it is JW3 serving us something
    // other than its listing, and passing it on as an empty retrieve only
    // defers the failure to transform, past the retry that could clear it.
    if (urlsOnPage.length === 0 && page === 1) {
      throw new Error(`No events found on ${getSearchUrl(page)}`);
    }
    if (urlsOnPage.length === 0) break;

    // A page adding nothing new is JW3 ignoring the page parameter, as it did
    // `page` - the loop would otherwise run until Bunny Shield challenges the
    // crawl. Fail rather than stop, since stopping here would silently drop
    // every film past the first page.
    if (urlsOnPage.every((url) => urls.has(url))) {
      throw new Error(
        `No new events on ${getSearchUrl(page)} - is the page parameter still honoured?`,
      );
    }

    movieListPages.push(searchResults);
    urlsOnPage.forEach((url) => urls.add(url));
    page += 1;
  }

  const moviePages = {};
  for (const url of Array.from(urls)) {
    const listing = await getPageContent(getPage, `${domain}${url}`);

    // Every listing carries its Spektrix event ID in the page's dataLayer, and
    // without it there are no performances to retrieve. Fail rather than fall
    // back to matching the listing title against the client's event list —
    // titles repeat across re-runs of the same film, so a name match can
    // silently attach another event's showtimes to this listing.
    const pageDataLayer = listing.match(
      /<script>\s*var\s+dataLayer\s+=\s+(.*);\s+<\/script>/i,
    );
    if (!pageDataLayer) {
      throw new Error(`No dataLayer found on ${domain}${url}`);
    }

    const pageData = JSON.parse(pageDataLayer[1]);
    const itemProductionId = pageData[0].detail_items[0].item_production;
    const eventId = getWebEventId(itemProductionId);

    // Some listings are a hub for a festival JW3 hosts but doesn't sell -
    // the UK Jewish Film Festival's page carries "UKJF2026" in place of a
    // Spektrix ID and sends its "Tickets" link to the festival's own site.
    // There are no JW3 performances to retrieve, so skip it, but only when
    // booking is plainly handed elsewhere: a missing ID on a page selling its
    // own tickets is still a failure.
    const externalBookingUrl = !eventId && getExternalBookingUrl(listing);
    if (externalBookingUrl) {
      console.log(
        `      - ⚠️  Skipping ${domain}${url} - "${itemProductionId}" is not a Spektrix event, tickets are sold at ${externalBookingUrl}`,
      );
      continue;
    }

    if (!eventId) {
      throw new Error(
        `No Spektrix event ID found in "${itemProductionId}" on ${domain}${url}`,
      );
    }

    const booking = await retrieveEventBooking(spektrixClient, eventId);
    moviePages[url] = { listing, booking };
  }

  return {
    movieListPages,
    moviePages,
  };
}

const retrieve = () => withCamoufoxSession(retrieveListings);

module.exports = retrieve;
