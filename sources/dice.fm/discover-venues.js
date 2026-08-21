const path = require("node:path");
const { readJSON, basicNormalize } = require("../../common/utils");
const { isInLondon } = require("../../common/geo-utils");
const {
  sortVenuesByEventCount,
  findMatchingCinema,
} = require("../../common/source-utils");
const { getAllCinemaAttributes } = require("../../cinemas");

async function discoverVenues() {
  const dataSrc = path.join(process.cwd(), "retrieved-data", "dice.fm");
  const data = await readJSON(dataSrc);
  const events = data.events || [];

  // Group events by venue
  const venueMap = new Map();

  for (const event of events) {
    const venue = event.venues?.[0];
    if (!venue) continue;

    const coordinates = {
      lat: venue.location.lat,
      lon: venue.location.lng,
    };

    const venueKey = `${basicNormalize(venue.name)}_${coordinates.lat}_${coordinates.lon}`;
    if (!venueMap.has(venueKey)) {
      venueMap.set(venueKey, {
        name: venue.name,
        address: venue.address,
        coordinates,
        events: [],
      });
    }
    venueMap.get(venueKey).events.push({
      url: `https://dice.fm/event/${event.perm_name}`,
      venueName: venue.name,
      coordinates,
    });
  }

  const knownCinemas = getAllCinemaAttributes();

  const results = [];
  for (const [, venue] of venueMap.entries()) {
    // Passing the address keeps discovery in step with find-events.js, which
    // matches on the same postcode fallback. Without it a venue whose pin sits
    // just outside the distance limit is reported as one we don't know about,
    // even while its events are being retrieved perfectly well.
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
