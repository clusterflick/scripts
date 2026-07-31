const cheerio = require("cheerio");

function extractEventIdFromUrl(url) {
  // Event hrefs look like "/events/{slug}/{id}?date=..." - drop any query
  // string or fragment so the same event doesn't produce different showing ids
  // across dates, and ignore empty segments from a trailing slash.
  const pathname = url.split(/[?#]/)[0];
  const segments = pathname.split("/").filter(Boolean);
  return segments.at(-1);
}

// Every event linked from a club's listing page, deduped by event id - a club
// running the same event on several dates lists it once per date, all pointing
// at the same event page.
function extractEventLinks(html) {
  const $ = cheerio.load(html);
  const links = new Map();

  $(".events-listing__item .event__title a").each((index, element) => {
    const href = $(element).attr("href");
    if (!href) return;

    const eventId = extractEventIdFromUrl(href);
    if (links.has(eventId)) return;

    links.set(eventId, {
      eventId,
      url: `https://www.tickettailor.com${href.split(/[?#]/)[0]}`,
    });
  });

  return [...links.values()];
}

module.exports = {
  extractEventIdFromUrl,
  extractEventLinks,
};
