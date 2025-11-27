const path = require("node:path");
const { readJSON, basicNormalize } = require("../../common/utils");
const distanceInKmBetweenCoordinates = require("../../common/distance-in-km-between-coordinates");
const { isInLondon } = require("../../analysis/utils");
const {
  loadKnownCinemas,
  sortVenuesByEventCount,
  findMatchingCinema,
} = require("../../common/source-utils");

async function discoverVenues() {
  const dataSrc = path.join(
    process.cwd(),
    "retrieved-data",
    "ticketsource.co.uk",
  );
  const data = await readJSON(dataSrc);

  const allHits = data.movieListPages
    .flatMap(({ hits }) => hits)
    // Remove duplicates; as we're running more than one search, it's possible
    // to get the same values back for both.
    .reduce((acc, hit) => {
      const missingValue = !acc.find((item) => item.objectID === hit.objectID);
      if (missingValue) acc.push(hit);
      return acc;
    }, []);

  // Group hits by venue
  const venueMap = new Map();

  for (const hit of allHits) {
    const name = hit.venue;
    const lat = hit._geoloc.lat;
    const lon = hit._geoloc.lng;

    // Create a unique key for the venue using name and approximate coordinates
    const venueKey = `${basicNormalize(name)}_${lat}_${lon}`;
    if (!venueMap.has(venueKey)) {
      venueMap.set(venueKey, { name, coordinates: { lat, lon }, events: [] });
    }
    venueMap.get(venueKey).events.push(hit);
  }

  const knownCinemas = await loadKnownCinemas();

  const results = [];
  for (const [, venue] of venueMap.entries()) {
    // Find matching cinema (using same logic as find-events.js)
    const matchingCinema = findMatchingCinema(
      knownCinemas,
      venue.name,
      venue.coordinates,
      { supportMisconfiguredCoordinates: true },
    );

    // If venue is far away, coords are misconfigured and assume it's in London
    const distance = distanceInKmBetweenCoordinates(
      { lat: 51.49028, lon: -0.12324 },
      venue.coordinates,
    );
    const inLondon =
      distance > 5000
        ? true
        : await isInLondon(venue.coordinates.lat, venue.coordinates.lon);

    results.push({
      ...venue,
      inLondon,
      matchingCinema,
    });
  }

  return sortVenuesByEventCount(results);
}

module.exports = discoverVenues;
