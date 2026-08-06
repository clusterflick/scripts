const cheerio = require("cheerio");
const { fetchText } = require("../../common/utils");
const {
  getWebEventId,
  retrieveEventBooking,
} = require("../../common/spektrix");
const { domain } = require("./attributes");

const spektrixClient = "jw3";

const getSearchUrl = (page = 1) =>
  `${domain}/whats-on?genres[]=19&max=27&page=${page}`;

async function retrieve() {
  const movieListPages = [];
  const urls = new Set();
  let page = 0;
  while (true) {
    const searchResults = await fetchText(getSearchUrl(page));
    const $ = cheerio.load(searchResults);
    const urlsOnPage = $(".eventCard .thumb a")
      .map((i, el) => $(el).attr("href"))
      .get();
    if (urlsOnPage.length === 0) break;

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
