const cheerio = require("cheerio");
const { fetchText } = require("../../common/utils");
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

  const moviePages = {};
  for (const url of Array.from(urls)) {
    const listing = await fetchText(`${domain}${url}`);
    const $ = cheerio.load(listing);
    const bookingUrl = $(".m-banner__links a.a-btn").eq(0).attr("href");
    const eventId = new URLSearchParams(new URL(bookingUrl).search).get(
      "EventId",
    );
    let booking = null;
    if (eventId) {
      booking = await fetchText(
        `https://app.spektrix-link.com/clients/jw3/events/${eventId}.json`,
      );
    }
    moviePages[url] = { listing, booking };
  }

  return {
    movieListPages,
    moviePages,
  };
}

module.exports = retrieve;
