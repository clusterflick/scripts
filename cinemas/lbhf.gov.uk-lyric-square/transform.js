const { decode } = require("html-entities");
const {
  sanitizeRichText,
  generateShowingId,
  createPerformance,
  createOverview,
  createAccessibility,
} = require("../../common/utils");
const { extractJsonLdEvents } = require("../../common/tribe-events/transform");
const attributes = require("./attributes");

function extractEventSlug(url) {
  return url.split("/event/")[1].replace(/\/$/, "");
}

async function transform({ movieListPages }, sourcedEvents) {
  // Events can recur across pages, so dedupe by URL.
  const eventsMap = new Map();

  for (const html of movieListPages) {
    for (const event of extractJsonLdEvents(html)) {
      if (event.eventStatus === "https://schema.org/EventCancelled") continue;
      if (eventsMap.has(event.url)) continue;

      const title = decode(event.name).replaceAll("\\", "");
      // The calendar lists all kinds of BID events; only the film nights (which
      // carry "Film" in the title) are relevant here.
      if (!title.toLowerCase().includes("film")) continue;

      // Descriptions are double-encoded HTML, so sanitise twice.
      const synopsis = sanitizeRichText(
        sanitizeRichText(event.description || ""),
      );

      const startDate = new Date(event.startDate);
      const endDate = new Date(event.endDate);
      const duration = (endDate - startDate) / 60_000;

      eventsMap.set(event.url, {
        showingId: generateShowingId(attributes, extractEventSlug(event.url)),
        title,
        url: event.url,
        overview: createOverview({ duration }),
        performances: [
          createPerformance({
            date: startDate,
            url: event.url,
            accessibility: createAccessibility(title, {}, synopsis),
          }),
        ],
        matchingHints: {
          overview: synopsis,
        },
      });
    }
  }

  const movies = Array.from(eventsMap.values());

  if (movies.length === 0) {
    throw new Error("No movies found — page structure may have changed");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
