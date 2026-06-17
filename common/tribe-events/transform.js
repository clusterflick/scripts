const cheerio = require("cheerio");

// Tribe view fragments embed their events as a single JSON-LD array. Returns an
// empty array when a page has no events.
function extractJsonLdEvents(html) {
  const $ = cheerio.load(html);
  const jsonLd = $('script[type="application/ld+json"]');
  if (!jsonLd.length) return [];
  return JSON.parse(jsonLd.html());
}

module.exports = { extractJsonLdEvents };
