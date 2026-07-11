const path = require("node:path");
const cheerio = require("cheerio");
const { parse, differenceInMinutes } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const {
  createPerformance,
  createOverview,
  generateShowingId,
  getText,
  readJSON,
  createAccessibility,
  createFormat,
} = require("../../common/utils");
const attributes = require("./attributes");
const { venueMatchesCinema } = require("../../common/source-utils");

/**
 * Try parsing a time+date string with date-fns, attempting with and without minutes.
 * Returns the parsed Date or throws if neither format matches.
 */
function parseTitoDateTime(text) {
  const withMinutes = parse(text, "h:mma, MMMM do, yyyy", new Date(), {
    locale: enGB,
  });
  if (!isNaN(withMinutes.getTime())) return withMinutes;

  const withoutMinutes = parse(text, "ha, MMMM do, yyyy", new Date(), {
    locale: enGB,
  });
  if (!isNaN(withoutMinutes.getTime())) return withoutMinutes;

  throw new Error(`Failed to parse Tito datetime: "${text}"`);
}

/**
 * Try parsing a time-only string with date-fns, using referenceDate for the date.
 * Returns the parsed Date or throws if neither format matches.
 */
function parseTitoTime(text, referenceDate) {
  const withMinutes = parse(text, "h:mma", referenceDate, { locale: enGB });
  if (!isNaN(withMinutes.getTime())) return withMinutes;

  const withoutMinutes = parse(text, "ha", referenceDate, { locale: enGB });
  if (!isNaN(withoutMinutes.getTime())) return withoutMinutes;

  throw new Error(`Failed to parse Tito time: "${text}"`);
}

/**
 * Parse the calendar text from a Tito event page.
 * Format: "START–ENDam/pm, MONTH DAYth, YEAR"
 * e.g.    "2–4:15pm, February 21st, 2026"
 */
function parseCalText(calText) {
  const [startTimeStr, endTimeAndDate] = calText.split("\u2013");
  if (!endTimeAndDate) {
    throw new Error(`Expected en-dash in calendar text: "${calText}"`);
  }

  // Parse end time + date directly (e.g. "4:15pm, February 21st, 2026")
  const endDate = parseTitoDateTime(endTimeAndDate.trim());

  // Start time omits am/pm when same as end — inherit it
  const amPm = endTimeAndDate.match(/(am|pm)/i)?.[1];
  if (!amPm) {
    throw new Error(`Expected am/pm in calendar text: "${calText}"`);
  }
  const startWithAmPm = startTimeStr.trim().match(/(am|pm)$/i)
    ? startTimeStr.trim()
    : `${startTimeStr.trim()}${amPm}`;

  // Parse start time using endDate as reference for the date portion
  const startDate = parseTitoTime(startWithAmPm, endDate);

  return { startDate, endDate };
}

/**
 * Extract lat/lon coordinates from a Google Maps URL.
 * URL format: https://maps.google.com/maps?q=LAT%2CLON+%28...%29
 */
function extractCoordinatesFromMapsUrl(href) {
  const url = new URL(href);
  const q = url.searchParams.get("q");
  if (!q) {
    throw new Error(`Expected "q" parameter in maps URL: ${href}`);
  }
  const match = q.match(/^([-\d.]+),([-\d.]+)/);
  if (!match) {
    throw new Error(`Expected coordinates in maps URL "q" parameter: "${q}"`);
  }
  return {
    lat: parseFloat(match[1]),
    lon: parseFloat(match[2]),
  };
}

/**
 * Extract event path from URL for use as event ID.
 * e.g., "https://ti.to/queereast/hello-world" → "queereast/hello-world"
 */
function extractEventPath(url) {
  return new URL(url).pathname.replace(/^\/|\/$/g, "");
}

/**
 * Extract all event details from a Tito event page HTML.
 */
function extractEventDetails(html, url) {
  const $ = cheerio.load(html);

  const title = getText($(".event-title"));
  if (!title) {
    throw new Error(`No .event-title found on ${url}`);
  }

  const calText = getText($(".tito-event-homepage--basic-info-cal a"));
  if (!calText) {
    throw new Error(`No calendar info found on ${url}`);
  }

  const locationHref = $(".tito-event-homepage--basic-info-location a").attr(
    "href",
  );
  if (!locationHref) {
    throw new Error(`No location link found on ${url}`);
  }

  const venueAddress = getText($(".tito-venues li a span"));
  if (!venueAddress) {
    throw new Error(`No .tito-venues address found on ${url}`);
  }

  const description = getText($(".tito-description"));

  const coordinates = extractCoordinatesFromMapsUrl(locationHref);

  // First segment of venue address is the venue name
  const venueName = venueAddress.split(",")[0].trim();

  const parsedDate = parseCalText(calText);

  return {
    title,
    venueName,
    venueAddress,
    coordinates,
    parsedDate,
    description,
  };
}

function convertTitoEvent(url, eventDetails) {
  const { title, parsedDate, description } = eventDetails;
  const eventPath = extractEventPath(url);
  const duration = differenceInMinutes(
    parsedDate.endDate,
    parsedDate.startDate,
  );

  return {
    showingId: generateShowingId(attributes, eventPath),
    title,
    url,
    overview: createOverview({ duration }),
    performances: [
      createPerformance({
        date: parsedDate.startDate,
        url,
        accessibility: createAccessibility(title, {}, description),
        format: createFormat(title, {}, description),
      }),
    ],
    matchingHints: { overview: description },
  };
}

/**
 * Find events matching a specific cinema
 */
async function findEvents(cinema) {
  const dataSrc = path.join(process.cwd(), "retrieved-data", "ti.to");

  let data = {};
  try {
    data = await readJSON(dataSrc);
  } catch {
    return [];
  }

  const events = [];

  for (const venueData of Object.values(data)) {
    const { moviePages } = venueData;
    if (!moviePages) continue;

    for (const [url, html] of Object.entries(moviePages)) {
      const eventDetails = extractEventDetails(html, url);

      const { venueName, coordinates, venueAddress } = eventDetails;

      // Match venue using coordinates (primary), falling back to
      // venue name + postcode matching via eventAddress
      if (
        venueMatchesCinema(cinema, venueName, coordinates, {
          eventAddress: venueAddress,
        })
      ) {
        events.push(convertTitoEvent(url, eventDetails));
      }
    }
  }

  return events;
}

module.exports = findEvents;
