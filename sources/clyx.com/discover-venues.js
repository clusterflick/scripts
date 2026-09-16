const path = require("node:path");
const { readJSON, basicNormalize } = require("../../common/utils");
const { isInLondon } = require("../../common/geo-utils");
const {
  sortVenuesByEventCount,
  findMatchingCinema,
} = require("../../common/source-utils");
const { getAllCinemaAttributes } = require("../../cinemas");

async function discoverVenues() {
  const dataSrc = path.join(process.cwd(), "retrieved-data", "clyx.com");
  const data = await readJSON(dataSrc);
  const events = Object.values(data.events || {});

  // Group events by venue
  const venueMap = new Map();

  for (const event of events) {
    const { location } = event;
    // Matched on name, so a venue without one is not a venue we could know.
    if (!location?.locationName) continue;

    const coordinates = {
      lat: location.latitude,
      lon: location.longitude,
    };

    const venueKey = `${basicNormalize(location.locationName)}_${coordinates.lat}_${coordinates.lon}`;
    if (!venueMap.has(venueKey)) {
      venueMap.set(venueKey, {
        name: location.locationName,
        address: location.address,
        coordinates,
        events: [],
      });
    }
    venueMap.get(venueKey).events.push({
      url: `https://clyx.com/feed/${event.slug}`,
      venueName: location.locationName,
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
