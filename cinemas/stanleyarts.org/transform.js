const cheerio = require("cheerio");
const {
  generateShowingId,
  createPerformance,
  createOverview,
  createAccessibility,
  createFormat,
  getTitleAccessibility,
} = require("../../common/utils");
const { extractJsonLdEvents } = require("../../common/tribe-events/transform");
const attributes = require("./attributes");

function decodeDescription(rawDescription) {
  return cheerio.load(rawDescription).text().trim().replace(/\s+/g, " ");
}

async function transform({ movieListPages }, sourcedEvents) {
  const movies = [];

  for (const html of movieListPages) {
    for (const event of extractJsonLdEvents(html)) {
      if (event.eventStatus === "https://schema.org/EventCancelled") continue;

      const slug = event.url.split("/event/")[1].replace(/\/$/, "");
      const synopsis = decodeDescription(event.description);
      const startDate = new Date(event.startDate);
      const endDate = new Date(event.endDate);
      const durationMins = (endDate - startDate) / 60_000;

      movies.push({
        showingId: generateShowingId(attributes, slug),
        title: event.name,
        url: event.url,
        overview: createOverview({ duration: durationMins }),
        performances: [
          createPerformance({
            date: startDate,
            url: event.url,
            accessibility: createAccessibility(
              event.name,
              getTitleAccessibility(synopsis),
              synopsis,
            ),
            format: createFormat(event.name, {}, synopsis),
          }),
        ],
        matchingHints: {
          overview: synopsis,
        },
      });
    }
  }

  if (movies.length === 0) {
    throw new Error("No movies found — page structure may have changed");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
