const cheerio = require("cheerio");
const {
  generateShowingId,
  createPerformance,
  createOverview,
  createAccessibility,
  getTitleAccessibility,
} = require("../../common/utils");
const attributes = require("./attributes");

function parseEvents(html) {
  const match = html.match(
    /<script type="application\/ld\+json">(.*?)<\/script>/s,
  );

  if (!match) {
    throw new Error("No ld+json found — page structure may have changed");
  }

  return JSON.parse(match[1]);
}

function decodeDescription(rawDescription) {
  return cheerio.load(rawDescription).text().trim().replace(/\s+/g, " ");
}

async function transform({ movieListPages }, sourcedEvents) {
  const movies = [];

  for (const html of movieListPages) {
    for (const event of parseEvents(html)) {
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
