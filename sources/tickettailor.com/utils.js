const cheerio = require("cheerio");

// A promoter can lock an event behind an access code while still listing it on
// their public page. Its event page is then a code form in place of the event
// details, and nobody without the code can book it.
const ACCESS_CODE_SELECTOR = "main.password_protected";

function isAccessCodePage(html) {
  return cheerio.load(html)(ACCESS_CODE_SELECTOR).length > 0;
}

// An event running on several dates is listed once, with "Multiple dates and
// times" in place of a date - the occurrences only appear on its date picker.
function isMultipleDates(dateText) {
  return /multiple dates/i.test(dateText);
}

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

  $(".events-listing__item").each((index, element) => {
    const $event = $(element);
    const href = $event.find(".event__title a").attr("href");
    if (!href) return;

    const eventId = extractEventIdFromUrl(href);
    if (links.has(eventId)) return;

    links.set(eventId, {
      eventId,
      url: `https://www.tickettailor.com${href.split(/[?#]/)[0]}`,
      hasMultipleDates: isMultipleDates(
        $event.find(".event-meta__date").text(),
      ),
    });
  });

  return [...links.values()];
}

module.exports = {
  ACCESS_CODE_SELECTOR,
  isAccessCodePage,
  isMultipleDates,
  extractEventIdFromUrl,
  extractEventLinks,
};
