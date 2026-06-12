const path = require("node:path");
const { readJSON, basicNormalize } = require("../../common/utils");
const distanceInKmBetweenCoordinates = require("../../common/distance-in-km-between-coordinates");
const { isInLondon } = require("../../common/geo-utils");
const {
  sortVenuesByEventCount,
  findMatchingCinema,
} = require("../../common/source-utils");
const { getAllCinemaAttributes } = require("../../cinemas");

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
    const lat = hit._geo.lat;
    const lon = hit._geo.lng;

    // Create a unique key for the venue using name and approximate coordinates
    const venueKey = `${basicNormalize(name)}_${lat}_${lon}`;
    if (!venueMap.has(venueKey)) {
      const eventAddress = [
        hit.venueAdd1,
        hit.venueAdd2,
        hit.venueAdd3,
        hit.venueAdd4,
        hit.venuePostcode,
      ]
        .filter(Boolean)
        .join(", ")
        .trim();
      venueMap.set(venueKey, {
        name,
        coordinates: { lat, lon },
        events: [],
        eventAddress,
      });
    }
    venueMap.get(venueKey).events.push(hit);
  }

  const knownCinemas = getAllCinemaAttributes();

  const results = [];
  for (const [, venue] of venueMap.entries()) {
    // Find matching cinema (using same logic as find-events.js)
    const matchingCinema = findMatchingCinema(
      knownCinemas,
      venue.name,
      venue.coordinates,
      {
        supportMisconfiguredCoordinates: true,
        eventAddress: venue.eventAddress,
      },
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
