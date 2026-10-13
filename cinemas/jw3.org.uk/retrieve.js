const cheerio = require("cheerio");
const { fetchText, basicNormalize } = require("../../common/utils");
const {
  getWebEventId,
  retrieveEventBooking,
} = require("../../common/spektrix");
const { domain } = require("./attributes");

const spektrixClient = "jw3";

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

async function retrieve() {
  const movieListPages = [];
  const urls = new Set();
  let page = 1;
  while (true) {
    const searchResults = await fetchText(getSearchUrl(page));
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
    const listing = await fetchText(`${domain}${url}`);

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

module.exports = retrieve;
