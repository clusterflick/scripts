const path = require("node:path");
const { readJSON } = require("../../common/utils");
const { isInLondon } = require("../../common/geo-utils");
const {
  sortVenuesByEventCount,
  findMatchingCinema,
} = require("../../common/source-utils");
const { getAllCinemaAttributes } = require("../../cinemas");
const attributes = require("./attributes");

async function discoverVenues() {
  const dataSrc = path.join(process.cwd(), "retrieved-data", "cinebur.com");
  const data = await readJSON(dataSrc);
  const events = data.events || [];

  // Group events by venue - every event names its venue by document, so the
  // path is the key
  const venueMap = new Map();

  for (const event of events) {
    const { venue } = event;
    if (!venue) continue;

    const coordinates = {
      lat: venue.location.latitude,
      lon: venue.location.longitude,
    };

    if (!venueMap.has(venue.path)) {
      venueMap.set(venue.path, {
        name: venue.name,
        address: venue.address,
        coordinates,
        events: [],
      });
    }
    venueMap.get(venue.path).events.push({
      url: attributes.url,
      venueName: venue.name,
      coordinates,
    });
  }

  const knownCinemas = getAllCinemaAttributes();

  const results = [];
  for (const [, venue] of venueMap.entries()) {
    // Passing the address keeps discovery in step with find-events.js, which
    // matches on the same postcode fallback.
    const matchingCinema = findMatchingCinema(
      knownCinemas,
      venue.name,
      venue.coordinates,
      { eventAddress: venue.address },
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
