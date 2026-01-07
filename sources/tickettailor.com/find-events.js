const path = require("node:path");
const cheerio = require("cheerio");
const { parse, differenceInMinutes } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const {
  createPerformance,
  createOverview,
  generateShowingId,
  getText,
  basicNormalize,
  createAccessibility,
  readJSON,
} = require("../../common/utils");
const attributes = require("./attributes");
const {
  venueMatchesCinema,
  extractPostcode,
} = require("../../common/source-utils");

function extractEventIdFromUrl(url) {
  const urlParts = url.split("/");
  return urlParts.at(-1) || urlParts.at(-2);
}

function parseDateText(dateText) {
  if (basicNormalize(dateText).includes("multiple dates")) {
    return null;
  }
  const [date, endTime] = dateText.split(" - ");
  const start = parse(date, "EEE d MMM yyyy h:mm a", new Date(), {
    locale: enGB,
  });
  const end = parse(endTime, "h:mm a", start, {
    locale: enGB,
  });
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
      duration: differenceInMinutes(parsedDate.end, parsedDate.start),
    }),
    performances: [
      createPerformance({
        date: parsedDate.start,
        url: fullUrl,
        status: {},
        accessibility: createAccessibility(title, {}),
      }),
    ],
    matchingHints: {
      overview: title,
    },
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

  // Match events to the cinema based on BOTH venue name AND postcode
  // Location text contains venue name + address (e.g., "Good Shepherd Studios, Leytonstone, E11 3DR")
  const cinemaPostcode = extractPostcode(cinema.address);

  const matchingEvents = allEvents.filter((event) => {
    if (!event.locationText) return false;

    // Extract venue name (first part before comma) and postcode
    const venueName = event.locationText.split(",")[0].trim();
    const eventPostcode = extractPostcode(event.locationText);

    // Require both name and postcode to match for high confidence
    const nameMatches = venueMatchesCinema(cinema, venueName, null);
    const postcodeMatches =
      eventPostcode && cinemaPostcode && eventPostcode === cinemaPostcode;

    return nameMatches && postcodeMatches;
  });

  return matchingEvents.map((event) => convertTicketTailorEvent(event));
}

module.exports = findEvents;
