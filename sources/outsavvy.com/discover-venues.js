const path = require("node:path");
const cheerio = require("cheerio");
const { readJSON, basicNormalize, getText } = require("../../common/utils");
const { isInLondon } = require("../../common/geo-utils");
const {
  sortVenuesByEventCount,
  findMatchingCinema,
} = require("../../common/source-utils");
const { getAllCinemaAttributes } = require("../../cinemas");

function extractCoordinates($) {
  const mapImg = $(".website-map img[data-src*='marker-point.png']");
  const dataSrc = mapImg.attr("data-src");

  // Extract coordinates from URL like: marker-point.png(-0.1011974,51.46507)
  const match = dataSrc.match(/marker-point\.png\(([^,]+),([^)]+)\)/);
  if (!match) return null;

  return {
    lon: parseFloat(match[1]),
    lat: parseFloat(match[2]),
  };
}

function extractVenueDetails(html) {
  const $ = cheerio.load(html);
  const venueName = getText($(".event-item-venue span span").first());
  const coordinates = extractCoordinates($);
  return { venueName, coordinates };
}

async function discoverVenues() {
  const dataSrc = path.join(process.cwd(), "retrieved-data", "outsavvy.com");
  const data = await readJSON(dataSrc);
  const moviePages = data.moviePages || {};

  // Extract venue details from each event
  const events = [];
  for (const [url, html] of Object.entries(moviePages)) {
    const { venueName, coordinates } = extractVenueDetails(html);
    if (venueName && coordinates) {
      events.push({ url, venueName, coordinates });
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
