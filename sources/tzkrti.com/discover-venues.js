const path = require("node:path");
const { readJSON } = require("../../common/utils");
const { isInLondon } = require("../../common/geo-utils");
const {
  sortVenuesByEventCount,
  findMatchingCinema,
} = require("../../common/source-utils");
const { getAllCinemaAttributes } = require("../../cinemas");
const attributes = require("./attributes");
const { getEventUrl } = require("./utils");

async function discoverVenues() {
  const dataSrc = path.join(process.cwd(), "retrieved-data", attributes.id);
  const data = await readJSON(dataSrc);
  const events = Object.values(data.events || {});

  // Tzkrti gives every venue an id of its own, so events are grouped on it.
  const venueMap = new Map();
  for (const event of events) {
    const place = event.place_obj;
    if (!place?.name?.en) continue;

    if (!venueMap.has(place.id)) {
      const lat = Number.parseFloat(place.latitude);
      const lon = Number.parseFloat(place.longitude);
      venueMap.set(place.id, {
        name: place.name.en,
        coordinates:
          Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null,
        address: place.address || null,
        events: [],
      });
    }
    venueMap.get(place.id).events.push({
      url: getEventUrl(event),
      venueName: place.name.en,
    });
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

    const inLondon = venue.coordinates
      ? await isInLondon(venue.coordinates.lat, venue.coordinates.lon)
      : false;

    results.push({ ...venue, inLondon, matchingCinema });
  }

  return sortVenuesByEventCount(results);
}

module.exports = discoverVenues;
