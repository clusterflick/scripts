const cheerio = require("cheerio");
const {
  fetchText,
  fetchJson,
  basicNormalize,
  getText,
} = require("../../common/utils");
const { domain } = require("./attributes");

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

  const eventsData = await fetchJson(
    "https://system.spektrix.com/jw3/api/v3/events",
  );

  const moviePages = {};
  for (const url of Array.from(urls)) {
    const listing = await fetchText(`${domain}${url}`);
    const $ = cheerio.load(listing);
    let eventId;
    try {
      const pageDataLayer = page.match(
        /<script>\s*var\s+dataLayer\s+=\s+(.*);\s+<\/script>/i,
      );
      const pageData = JSON.parse(pageDataLayer[1]);
      const itemProductionId = pageData[0].detail_items[0].item_production;
      // The ID used for getting events is the starting 6 digit numerical part
      eventId = itemProductionId.match(/^(\d{6,7})/)[1];
    } catch {
      // If we can't, try finding an event with the same name from the events
      // list and using that ID instead
      const listingTitle = getText($(".desc h1").eq(0));
      const event = eventsData.find(
        ({ name }) => basicNormalize(name) === basicNormalize(listingTitle),
      );
      if (event) {
        // The ID used for getting events is the starting 6 digit numerical part
        const idMatch = event.id.match(/^(\d{6,7})/);
        if (idMatch) eventId = idMatch[1];
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
