const path = require("node:path");
const cheerio = require("cheerio");
const { parse, addYears, subDays } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const {
  createPerformance,
  createOverview,
  generateShowingId,
  readJSON,
  createAccessibility,
  createFormat,
  getText,
} = require("../../common/utils");
const { venueMatchesCinema } = require("../../common/source-utils");
const attributes = require("./attributes");

const eventMatcher = /STOW FILM LOUNGE @\s*/i;

/**
 * Parse film info from text like "TITLE (Director, Year, Cert Rating, Duration)"
 */
function parseFilmInfo(filmText) {
  // Match pattern: TITLE (Director, Year, Cert Rating, Duration)
  const match = filmText.match(
    /^(.+?)\s*\(([^,]+),\s*(\d{4}),\s*Cert\s+(\w+),\s*(\d+)\s*mins?\)/i,
  );

  if (!match) {
    // Try simpler match for just title
    const titleOnly = filmText.split("(")[0].trim();
    return { title: titleOnly };
  }

  return {
    title: match[1].trim(),
    directors: match[2].trim(),
    year: match[3],
    classification: match[4],
    duration: parseInt(match[5], 10),
  };
}

/**
 * Parse date from format like "FRIDAY 16th JANUARY" with time from "Film 19:45"
 */
function parseEventDate(dateText, timesText) {
  // Extract film start time from times text (e.g., "Doors 19:00, Film 19:45, Close 22:30")
  const timeMatch = timesText.match(/Films?\s+([^,]+)/i);
  if (!timeMatch) {
    throw new Error("Could not extract film time");
  }

  // "FRIDAY 16th JANUARY" + "19:45"
  const dateString = `${dateText} ${timeMatch[1].trim()}`;
  const now = new Date();

  let eventDate = parse(dateString, "EEEE do MMMM HH:mm", now, {
    locale: enGB,
  });

  // Handle year boundary - if date is more than 14 days in the past, it's next year
  // (events within 14 days may just be recently passed events still listed)
  const threshold = subDays(now, 14);
  if (eventDate < threshold) {
    eventDate = addYears(eventDate, 1);
  }

  return eventDate;
}

/**
 * Extract venue name from H3 text like "STOW FILM LOUNGE @ WALTHAM FOREST TOWN HALL"
 */
function extractVenueName(h3Text) {
  return h3Text.replace(eventMatcher, "").trim();
}

const getHost = (url) => new URL(url).host.replace(/^www\./, "").toLowerCase();

/**
 * Build an event id from the booking url, ignoring any query string, fragment
 * or trailing slash so the same event always produces the same showing id.
 *
 * Bookings on our own domain use a known "/buytickets/p/{slug}" shape, so the
 * last path segment identifies the event on its own. Bookings handed to an
 * external ticketing site can take any shape - a last segment of "tickets" or
 * "book" would be shared by every event on that site - so use the host and the
 * whole path for those.
 */
function extractEventId(bookingUrl) {
  const segments = new URL(bookingUrl).pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    throw new Error(`Unable to get an event id from booking url ${bookingUrl}`);
  }

  const host = getHost(bookingUrl);
  if (host === getHost(attributes.domain)) return segments.at(-1);
  return [host, ...segments].join("-");
}

/**
 * Parse a single event section using Squarespace block structure
 */
function parseEventSection($, section) {
  // Film info is in the figcaption (image block caption)
  // - First p: "TITLE (Director, Year, Cert, Duration)"
  // - Second p: "Doors HH:MM, Film HH:MM, Close HH:MM"
  const $captionParagraphs = section.find("figcaption").find("p");
  const filmText = getText($captionParagraphs.eq(0));
  let timesText = getText($captionParagraphs.eq(1));

  // Times info is also in a paragraph starting with "Doors:" within the content
  if (!timesText) {
    const $htmlContent = section.find(".sqs-html-content").eq(1);
    $htmlContent.find("p").each((i, el) => {
      const text = getText($(el));
      if (text.startsWith("Doors:")) {
        timesText = text;
        return false;
      }
    });
  }

  // Venue info is in the first html block's sqs-html-content
  // - h3: "STOW FILM LOUNGE @ VENUE NAME"
  // - h4: "FRIDAY 16th JANUARY"
  const $headerHtmlContent = section.find(".sqs-html-content").eq(0);
  const venueText = getText($headerHtmlContent.find("h3"));
  const venueName = extractVenueName(venueText);
  const dateText = getText($headerHtmlContent.find("h4"));

  // Booking link is in the button container
  const $bookingLink = section.find(".sqs-block-button-container a").first();
  const bookingPath = $bookingLink.attr("href") || "";

  // Bail if there's no ticket link (this may be a placeholder with "coming soon" text)
  if (!bookingPath) {
    return { venueName: "", event: {} };
  }

  const bookingUrl = bookingPath.startsWith("/")
    ? `${attributes.domain}${bookingPath}`
    : bookingPath;

  // Description is in subsequent html blocks (after the first one with venue info)
  const descriptions = [];
  section
    .find(".sqs-html-content")
    .slice(1)
    .each((i, content) => {
      descriptions.push(getText($(content)));
    });

  const { title, ...overview } = parseFilmInfo(filmText);
  const eventDate = parseEventDate(dateText, timesText);

  const eventId = extractEventId(bookingUrl);
  const synopsis = descriptions.join("\n\n");

  return {
    venueName,
    event: {
      showingId: generateShowingId(attributes, eventId),
      title,
      url: bookingUrl || attributes.url,
      overview: createOverview(overview),
      performances: [
        createPerformance({
          date: eventDate,
          url: bookingUrl || attributes.url,
          status: {},
          accessibility: createAccessibility(title, {}, synopsis),
          format: createFormat(title, {}, synopsis),
        }),
      ],
      matchingHints: { overview: synopsis },
    },
  };
}

/**
 * An event section is a leaf section headed by a "STOW FILM LOUNGE @ VENUE"
 * heading. Matching on the section's html alone isn't enough - the page wraps
 * the event sections in an outer section, which contains their markup and so
 * matches too, but holds the blocks of every event rather than one event's.
 */
function isEventSection(section) {
  if (section.find("section").length > 0) return false;

  const headingText = getText(
    section.find(".sqs-html-content").eq(0).find("h3"),
  );
  return eventMatcher.test(headingText);
}

/**
 * Find events matching a specific cinema
 */
async function findEvents(cinema) {
  const dataSrc = path.join(
    process.cwd(),
    "retrieved-data",
    "stowfilmlounge.com",
  );

  let data = {};
  try {
    data = await readJSON(dataSrc);
  } catch {
    return [];
  }

  const $ = cheerio.load(data.movieListPage);
  const events = [];

  $("section").each((i, el) => {
    const $section = $(el);

    // Skip sections that aren't a single event
    if (!isEventSection($section)) return;

    try {
      const { venueName, event } = parseEventSection($, $section);

      // Check if this venue matches the cinema we're looking for
      if (venueMatchesCinema(cinema, venueName)) {
        events.push(event);
      }
    } catch (error) {
      throw new Error(`Failed to parse event section: ${error.message}`);
    }
  });

  return events;
}

module.exports = findEvents;
