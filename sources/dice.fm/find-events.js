const path = require("node:path");
const cheerio = require("cheerio");
const normalizeName = require("../../common/normalize-name");
const distanceInKmBetweenCoordinates = require("../../common/distance-in-km-between-coordinates");
const {
  createOverview,
  createPerformance,
  readJSON,
  generateShowingId,
} = require("../../common/utils");
const attributes = require("./attributes");

function extractEventDetails(html) {
  const $ = cheerio.load(html);

  // Find the script tag containing ScreeningEvent JSON-LD
  let screeningEvent = null;
  $('script[type="application/ld+json"]').each((i, el) => {
    try {
      const content = $(el).html();
      const json = JSON.parse(content);
      if (json["@type"] === "ScreeningEvent") {
        screeningEvent = json;
      }
    } catch {
      // Skip invalid JSON
    }
  });

  return screeningEvent;
}

function convertDiceEvent(event) {
  const eventId = event.url.match(/\/event\/([^-]+)/)?.[1];

  const startDate = new Date(event.startDate);
  const endDate = new Date(event.endDate);

  return {
    showingId: generateShowingId(attributes, eventId),
    title: event.name,
    url: event.url,
    overview: createOverview({
      duration: (endDate.getTime() - startDate.getTime()) / 1000 / 60,
    }),
    performances: [
      createPerformance({
        date: startDate,
        url: event.url,
      }),
    ],
    matchingHints: {
      overview: event.description || "",
    },
  };
}

async function findEvents(cinema) {
  const dataSrc = path.join(process.cwd(), "retrieved-data", "dice.fm");

  let moviePages = {};
  try {
    const data = await readJSON(dataSrc);
    moviePages = data.moviePages || {};
  } catch {
    // Source data may not always be available or required
  }

  const events = [];
  for (const [url, html] of Object.entries(moviePages)) {
    const eventDetails = extractEventDetails(html);
    events.push({ url, ...eventDetails });
  }

  const filteredEvents = events.filter(({ location }) => {
    const coordinates = {
      lat: location.geo.latitude,
      lon: location.geo.longitude,
    };
    const distance = distanceInKmBetweenCoordinates(cinema.geo, coordinates);
    return (
      normalizeName(location.name) === normalizeName(cinema.name) &&
      distance < 0.1
    );
  });

  return filteredEvents.map((event) => convertDiceEvent(event));
}

module.exports = findEvents;
