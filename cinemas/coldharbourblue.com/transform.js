const cheerio = require("cheerio");
const { parseISO, differenceInMinutes } = require("date-fns");
const {
  sanitizeRichText,
  createPerformance,
  createOverview,
  generateShowingId,
} = require("../../common/utils");
const attributes = require("./attributes");
const { decode } = require("html-entities");

function extractEventIdFromUrl(url) {
  const urlParts = url.split("/");
  const eventSlug =
    urlParts[urlParts.length - 2] || urlParts[urlParts.length - 1];
  return eventSlug;
}

function extractJsonLdFromHtml(html) {
  const $ = cheerio.load(html);
  const jsonLdScript = $('script[type="application/ld+json"]');
  // For months with no events, we don't have any JSON-LD data
  if (!jsonLdScript.length) return [];
  return JSON.parse(jsonLdScript.html());
}

async function transform(retrievedData, sourcedEvents) {
  // Map to track events by URL to avoid duplicates across months
  const eventsMap = new Map();

  // Process each API response (one per month)
  for (const apiResponse of retrievedData) {
    const events = extractJsonLdFromHtml(apiResponse.html);

    for (const event of events) {
      if (eventsMap.has(event.url)) continue;

      const eventId = extractEventIdFromUrl(event.url);

      // Calculate duration from start and end dates
      const startDate = parseISO(event.startDate);
      const endDate = parseISO(event.endDate);
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
        title: decode(event.name),
        url: event.url,
        overview: createOverview({ duration }),
        performances: [
          createPerformance({
            date: startDate,
            url: event.url,
            status: { soldOut },
          }),
        ],
        matchingHints: {
          overview: sanitizeRichText(sanitizeRichText(event.description || "")),
        },
      });
    }
  }

  const movies = Array.from(eventsMap.values());

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
