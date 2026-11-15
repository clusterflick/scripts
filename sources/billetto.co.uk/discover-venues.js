const path = require("node:path");
const { readJSON, basicNormalize } = require("../../common/utils");
const { isInLondon } = require("../../common/geo-utils");
const {
  sortVenuesByEventCount,
  findMatchingCinema,
} = require("../../common/source-utils");
const { getAllCinemaAttributes } = require("../../cinemas");
const { getVenueNameParts } = require("./utils");

async function discoverVenues() {
  const dataSrc = path.join(process.cwd(), "retrieved-data", "billetto.co.uk");
  const data = await readJSON(dataSrc);
  const events = Object.values(data.events || {});

  // Group events by venue
  const venueMap = new Map();

  for (const event of events) {
    // Matched on name and place, as in find-events.js
    if (!event.venue_name || !event._geoloc) continue;

    const coordinates = { lat: event._geoloc.lat, lon: event._geoloc.lng };
    const venueKey = `${basicNormalize(event.venue_name)}_${coordinates.lat}_${coordinates.lon}`;
    if (!venueMap.has(venueKey)) {
      venueMap.set(venueKey, {
        name: event.venue_name,
        address: event.city || null,
        coordinates,
        events: [],
      });
    }
    venueMap.get(venueKey).events.push({
      url: event.url,
      venueName: event.venue_name,
      coordinates,
    });
  }

  const knownCinemas = getAllCinemaAttributes();

  const results = [];
  for (const [, venue] of venueMap.entries()) {
    // Each comma-separated part is tried, as in find-events.js
    const matchingCinema = getVenueNameParts(venue.name)
      .map((venueName) =>
        findMatchingCinema(knownCinemas, venueName, venue.coordinates),
      )
      .find(Boolean);

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
