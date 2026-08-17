const path = require("node:path");
const { readJSON, basicNormalize } = require("../../common/utils");
const { isInLondon } = require("../../common/geo-utils");
const {
  sortVenuesByEventCount,
  findMatchingCinema,
} = require("../../common/source-utils");
const { getAllCinemaAttributes } = require("../../cinemas");
const attributes = require("./attributes");

async function discoverVenues() {
  const dataSrc = path.join(process.cwd(), "retrieved-data", "feverup.com");
  const data = await readJSON(dataSrc);
  const planDetails = data.planDetails || {};

  // Group events by venue. A single plan (movie) can run at multiple places,
  // so each place becomes its own venue entry.
  const venueMap = new Map();

  for (const [planId, planDetail] of Object.entries(planDetails)) {
    const url = `${attributes.domain}/m/${planId}`;
    const places = planDetail.places || [];

    for (const place of places) {
      const { name, latitude, longitude, address } = place;
      if (!name) continue;

      const coordinates = { lat: latitude, lon: longitude };

      // Create a unique key for the venue using name and coordinates
      const venueKey = `${basicNormalize(name)}_${coordinates.lat}_${coordinates.lon}`;
      if (!venueMap.has(venueKey)) {
        venueMap.set(venueKey, { name, coordinates, address, events: [] });
      }
      venueMap.get(venueKey).events.push({ url, venueName: name, coordinates });
    }
  }

  const knownCinemas = getAllCinemaAttributes();

  const results = [];
  for (const [, venue] of venueMap.entries()) {
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
