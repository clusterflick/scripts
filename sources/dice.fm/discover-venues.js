const path = require("node:path");
const cheerio = require("cheerio");
const { readJSON, basicNormalize } = require("../../common/utils");
const { isInLondon } = require("../../common/geo-utils");
const {
  sortVenuesByEventCount,
  findMatchingCinema,
} = require("../../common/source-utils");
const { getAllCinemaAttributes } = require("../../cinemas");

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

async function discoverVenues() {
  const dataSrc = path.join(process.cwd(), "retrieved-data", "dice.fm");
  const data = await readJSON(dataSrc);
  const moviePages = data.moviePages || {};

  // Extract venue details from each event
  const events = [];
  for (const [url, html] of Object.entries(moviePages)) {
    const eventDetails = extractEventDetails(html);
    if (eventDetails?.location) {
      const { location } = eventDetails;
      events.push({
        url,
        venueName: location.name,
        coordinates: {
          lat: location.geo.latitude,
          lon: location.geo.longitude,
        },
      });
    }
  }

  // Group events by venue
  const venueMap = new Map();

  for (const event of events) {
    const { venueName, coordinates } = event;
    const { lat, lon } = coordinates;

    // Create a unique key for the venue using name and approximate coordinates
    const venueKey = `${basicNormalize(venueName)}_${lat}_${lon}`;
    if (!venueMap.has(venueKey)) {
      venueMap.set(venueKey, {
        name: venueName,
        coordinates: { lat, lon },
        events: [],
      });
    }
    venueMap.get(venueKey).events.push(event);
  }

  const knownCinemas = getAllCinemaAttributes();

  const results = [];
  for (const [, venue] of venueMap.entries()) {
    const matchingCinema = findMatchingCinema(
      knownCinemas,
      venue.name,
      venue.coordinates,
    );

    const inLondon = await isInLondon(
      venue.coordinates.lat,
      venue.coordinates.lon,
    );

    results.push({
      ...venue,
      inLondon,
      matchingCinema,
    });
  }

  return sortVenuesByEventCount(results);
}

module.exports = discoverVenues;
