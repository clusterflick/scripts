const cheerio = require("cheerio");
const { parse, isValid } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");

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

// A full date-and-time chunk, e.g. "Mon 3 Aug 2026 19:00" or "Mon 20 Jul 2026 1:00 PM"
const DATE_FORMATS = ["EEE d MMM yyyy h:mm a", "EEE d MMM yyyy HH:mm"];
// A bare time chunk on the start's day, e.g. "22:30" or "10:30 PM"
const TIME_FORMATS = ["h:mm a", "HH:mm"];
// A full date with no time, e.g. "Sun 26 Jul 2026"
const DATE_ONLY_FORMATS = ["EEE d MMM yyyy"];

// Try each format in turn and return the first valid parse, or null if none match.
function parseWithFormats(text, formats, reference) {
  for (const format of formats) {
    const parsed = parse(text, format, reference, { locale: enGB });
    if (isValid(parsed)) return parsed;
  }
  return null;
}

// A listing's date line, e.g. "Mon 3 Aug 2026 7:30 PM - 10:00 PM BST", as
// { start, end }, or null for a listing that isn't a single showing.
function parseDateText(dateText) {
  // Strip a trailing timezone token (e.g. "... 3:00 PM BST").
  const normalized = dateText.replace(/\s+(BST|GMT|UTC)$/i, "").trim();
  const [startText, endText] = normalized.split(" - ");

  if (parseWithFormats(startText, DATE_ONLY_FORMATS, new Date())) {
    // A start with no time (e.g. "Mon 2 Nov 2026") is a ticket for a day
    // rather than for a showing - a snack pre-order, a day pass, or a pass
    // running on to a later date - and a screening always has a start time, so
    // drop it.
    return null;
  }

  const start = parseWithFormats(startText, DATE_FORMATS, new Date());
  if (!start) {
    throw new Error(`Unable to parse start date from date text: "${dateText}"`);
  }

  if (endText && parseWithFormats(endText, DATE_ONLY_FORMATS, new Date())) {
    // A bare end date with no time (e.g. "Sun 26 Jul 2026") means the listing
    // spans multiple days — a festival/discovery pass rather than a single movie
    // showing — so drop it.
    return null;
  }

  let end = null;
  if (endText && !parseWithFormats(endText, DATE_FORMATS, new Date())) {
    // A full date in the end chunk (rather than a bare time) means the source
    // has crammed two separate events into one listing — a misconfiguration on
    // their part. In that case leave the end null; otherwise the end chunk is a
    // bare time anchored to the start's day.
    end = parseWithFormats(endText, TIME_FORMATS, start);
    if (!end) {
      throw new Error(`Unable to parse end time from date text: "${dateText}"`);
    }
  }

  return { start, end };
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
  parseDateText,
  parseWithFormats,
  TIME_FORMATS,
};
