const cheerio = require("cheerio");
const { parse, differenceInMinutes } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const {
  sanitizeRichText,
  createPerformance,
  removeAlreadyListedPerformances,
  createOverview,
  generateShowingId,
  createAccessibility,
  createFormat,
} = require("../../common/utils");
const { extractJsonLdEvents } = require("../../common/tribe-events/transform");
const { isNotSportShowing } = require("../../common/is-sport-showing");
const attributes = require("./attributes");
const { decode } = require("html-entities");

function parseDate(dateString) {
  // Ignore offset which is incorrect
  // (times are currently in BST but incorrectly have 00:00 offset)
  const [date] = dateString.split("+");
  return parse(date, "yyyy-MM-dd'T'HH:mm:ss", new Date(), {
    locale: enGB,
  });
}

function extractEventIdFromUrl(url) {
  const urlParts = url.split("/");
  const eventSlug =
    urlParts[urlParts.length - 2] || urlParts[urlParts.length - 1];
  return eventSlug;
}

const venueHostname = new URL(attributes.domain).hostname.replace(/^www\./, "");

// Events ticketed off-site carry an "Event Info & Tickets" button in their
// description, pointing at the platform selling them. Links back to the venue's
// own site say nothing the event URL doesn't already, so they are ignored.
function extractExternalBookingUrl(eventPageHtml) {
  const $ = cheerio.load(eventPageHtml);
  const href = $(
    ".tribe-events-single-event-description a.tribe-events-button",
  ).attr("href");
  if (!href) return undefined;

  const { hostname } = new URL(href);
  if (hostname.replace(/^www\./, "") === venueHostname) return undefined;

  return href;
}

async function transform({ monthPages, eventPages }, sourcedEvents) {
  // Map to track events by URL to avoid duplicates across months
  const eventsMap = new Map();

  // Process each API response (one per month)
  for (const monthPage of monthPages) {
    const events = extractJsonLdEvents(monthPage);

    for (const event of events) {
      if (eventsMap.has(event.url)) continue;

      const eventPage = eventPages[event.url];
      if (!eventPage) {
        throw new Error(`No event page retrieved for ${event.url}`);
      }

      const eventId = extractEventIdFromUrl(event.url);
      const title = decode(event.name).replaceAll("\\", "");

      // Calculate duration from start and end dates
      const startDate = parseDate(event.startDate);
      const endDate = parseDate(event.endDate);
      const duration = differenceInMinutes(endDate, startDate);

      // Check offer availability for sold out status
      const availability = event.offers?.[0]?.availability || "";
      const soldOut =
        availability.includes("LimitedAvailability") ||
        availability.includes("SoldOut") ||
        availability.includes("OutOfStock");

      // Create new event
      eventsMap.set(event.url, {
        showingId: generateShowingId(attributes, eventId),
        title,
        url: event.url,
        overview: createOverview({ duration }),
        performances: [
          createPerformance({
            date: startDate,
            url: extractExternalBookingUrl(eventPage) || event.url,
            status: { soldOut },
            accessibility: createAccessibility(title, {}, event.description),
            format: createFormat(title, {}, event.description),
          }),
        ],
        matchingHints: {
          overview: sanitizeRichText(sanitizeRichText(event.description || "")),
        },
      });
    }
  }

  const movies = Array.from(eventsMap.values());

  if (movies.length === 0) {
    throw new Error("No movies found - the page structure may have changed");
  }

  const listedMovies = movies.filter(isNotSportShowing);
  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return listedMovies.concat(
    removeAlreadyListedPerformances(listedMovies, listOfSourcedEvents),
  );
}

module.exports = transform;
