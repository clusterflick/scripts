const path = require("node:path");
const cheerio = require("cheerio");
const { parse, differenceInMinutes, isValid } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const {
  createPerformance,
  createOverview,
  generateShowingId,
  getText,
  basicNormalize,
  createAccessibility,
  createFormat,
  readJSON,
} = require("../../common/utils");
const attributes = require("./attributes");
const { venueMatchesCinema } = require("../../common/source-utils");

function extractEventIdFromUrl(url) {
  // Event hrefs look like "/events/{slug}/{id}?date=..." - drop any query
  // string or fragment so the same event doesn't produce different showing ids
  // across dates, and ignore empty segments from a trailing slash.
  const pathname = url.split(/[?#]/)[0];
  const segments = pathname.split("/").filter(Boolean);
  return segments.at(-1);
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

function parseDateText(dateText) {
  if (basicNormalize(dateText).includes("multiple dates")) {
    return null;
  }
  // Strip a trailing timezone token (e.g. "... 3:00 PM BST").
  const normalized = dateText.replace(/\s+(BST|GMT|UTC)$/i, "").trim();
  const [startText, endText] = normalized.split(" - ");

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

function parseEventsFromPage(html, slug) {
  const $ = cheerio.load(html);
  const events = [];

  // Parse each event from the listing page
  $(".events-listing__item").each((index, element) => {
    const $event = $(element);

    // Extract basic event information
    const title = getText($event.find(".event__title a"));
    const eventUrl = $event.find(".event__title a").attr("href");
    const dateText = getText($event.find(".event-meta__date"));
    const locationText = getText($event.find(".event-meta__location"));
    const fullUrl = `https://www.tickettailor.com${eventUrl}`;
    const eventId = extractEventIdFromUrl(eventUrl);
    const parsedDate = parseDateText(dateText);

    // Skip events with multiple dates or unparseable dates for now
    if (!parsedDate) return;

    events.push({
      slug,
      title,
      fullUrl,
      eventId,
      parsedDate,
      locationText,
    });
  });

  return events;
}

function convertTicketTailorEvent(event) {
  const { title, fullUrl, eventId, parsedDate } = event;

  return {
    showingId: generateShowingId(attributes, eventId),
    title,
    url: fullUrl,
    overview: createOverview({
      duration: parsedDate.end
        ? differenceInMinutes(parsedDate.end, parsedDate.start)
        : undefined,
    }),
    performances: [
      createPerformance({
        date: parsedDate.start,
        url: fullUrl,
        status: {},
        accessibility: createAccessibility(title, {}), // No overview
        format: createFormat(title, {}),
      }),
    ],
    matchingHints: { overview: title },
  };
}

/**
 * Find events matching a specific cinema
 */
async function findEvents(cinema) {
  const dataSrc = path.join(
    process.cwd(),
    "retrieved-data",
    "tickettailor.com",
  );

  let clubPages = {};
  try {
    const data = await readJSON(dataSrc);
    clubPages = data.clubPages || {};
  } catch {
    // Source data may not always be available or required
  }

  // Parse all events from all club pages
  const allEvents = [];
  for (const [slug, html] of Object.entries(clubPages)) {
    const events = parseEventsFromPage(html, slug);
    allEvents.push(...events);
  }

  // Match events to the cinema on venue name plus postcode. Ticket Tailor gives
  // no coordinates, only a location string like "Good Shepherd Studios,
  // Leytonstone, E11 3DR", so we key on the name (first part before the comma)
  // and pass the whole string as the address for postcode matching. Delegating
  // to findMatchingCinema keeps this in step with discover-venues and lets an
  // outward-code (e.g. "E8") match through when a source has the inward code
  // slightly wrong.
  const matchingEvents = allEvents.filter((event) => {
    if (!event.locationText) return false;

    const venueName = event.locationText.split(",")[0].trim();
    return venueMatchesCinema(cinema, venueName, null, {
      eventAddress: event.locationText,
    });
  });

  return matchingEvents.map((event) => convertTicketTailorEvent(event));
}

module.exports = findEvents;
