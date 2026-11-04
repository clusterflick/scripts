const cheerio = require("cheerio");
const { fetchText } = require("../../common/utils");
const { url, domain, name } = require("./attributes");
const { getJsonLd, getEventPaths, parseEventPage } = require("./utils");

async function retrieve() {
  const storePage = await fetchText(url);
  // The store's own LocalBusiness record, so a redirect to the store finder or
  // a holding page fails here rather than reading as nothing on.
  const store = getJsonLd(cheerio.load(storePage), "LocalBusiness");
  if (store?.name !== name) {
    throw new Error(
      `Expected the ${name} store page, found ${store?.name || "no store"}`,
    );
  }

  const eventPages = {};
  for (const path of getEventPaths(storePage)) {
    const eventUrl = `${domain}${path}`;
    eventPages[eventUrl] = await fetchText(eventUrl);
    // Parsed here too, so a page that has changed shape fails at retrieve
    // rather than saving something the transform can't read.
    parseEventPage(eventPages[eventUrl]);
  }

  return { storePage, eventPages };
}

module.exports = retrieve;
