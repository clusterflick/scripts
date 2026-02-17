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

  // Use the booking path slug as the event ID (e.g., "/buytickets/p/iswear" -> "iswear")
  const eventId = bookingPath.split("/").pop();
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
        }),
      ],
      matchingHints: { overview: synopsis },
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
    const html = $section.html();

    // Skip sections that don't contain events
    if (!html.match(eventMatcher)) return;

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
