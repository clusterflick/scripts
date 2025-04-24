const cheerio = require("cheerio");
const {
  fetchText,
  fetchJson,
  basicNormalize,
  getText,
} = require("../../common/utils");
const { domain } = require("./attributes");

const getSearchUrl = (page = 0) =>
  `${domain}/whats-on?genre[3]=3&type=All&page=${page}`;

async function retrieve() {
  const movieListPages = [];
  const urls = new Set();
  let page = 0;
  while (true) {
    const searchResults = await fetchText(getSearchUrl(page));
    const $ = cheerio.load(searchResults);
    const urlsOnPage = $(".alt-teasers article h3 a")
      .map((i, el) => $(el).attr("href"))
      .get();
    if (urlsOnPage.length === 0) break;

    movieListPages.push(searchResults);
    urlsOnPage.forEach((url) => urls.add(url));
    page += 1;
  }

  const eventsData = await fetchJson(
    "https://system.spektrix.com/jw3/api/v3/events",
  );

  const moviePages = {};
  for (const url of Array.from(urls)) {
    const listing = await fetchText(`${domain}${url}`);
    const $ = cheerio.load(listing);
    const bookingUrl = $(".m-banner__links a.a-btn").eq(0).attr("href");
    let eventId;
    try {
      // Try getting event ID from the booking URL
      eventId = new URLSearchParams(new URL(bookingUrl).search).get("EventId");
    } catch {
      // If we can't, try finding an event with the same name from the events
      // list and using that ID instead
      const listingTitle = getText($("#block-mainpagecontent h1").eq(0));
      const event = eventsData.find(
        ({ name }) => basicNormalize(name) === basicNormalize(listingTitle),
      );
      if (event) {
        // The ID used for getting events is the starting 6 digit numerical part
        eventId = event.id.slice(0, 6);
      }
    }
    let booking = null;
    if (eventId) {
      booking = await fetchJson(
        `https://app.spektrix-link.com/clients/jw3/events/${eventId}.json`,
      );
    }
    moviePages[url] = { listing, booking };
  }

  return {
    eventsData,
    movieListPages,
    moviePages,
  };
}

module.exports = retrieve;
