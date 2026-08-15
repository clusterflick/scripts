const path = require("node:path");
const { readJSON, basicNormalize } = require("../../common/utils");
const { isInLondon } = require("../../common/geo-utils");
const {
  sortVenuesByEventCount,
  findMatchingCinema,
} = require("../../common/source-utils");
const { getAllCinemaAttributes } = require("../../cinemas");

function uniqueEvents(events) {
  const ids = {};
  return events.filter((event) => {
    const isNewEvent = !ids[event.id];
    ids[event.id] = true;
    return isNewEvent;
  });
}

async function discoverVenues() {
  const dataSrc = path.join(
    process.cwd(),
    "retrieved-data",
    "eventbrite.co.uk",
  );
  const data = await readJSON(dataSrc);
  const events = uniqueEvents(
    data.movieListPages.flatMap(
      ({ search_data: { events } }) => events.results,
    ),
  );

  // Group events by venue
  const venueMap = new Map();

  for (const event of events) {
    const {
      primary_venue: {
        name,
        address: { longitude: lon, latitude: lat },
      },
    } = event;

    // Create a unique key for the venue using name and approximate coordinates
    // Round coordinates to prevent slight variations from creating duplicate venues
    const venueKey = `${basicNormalize(name)}_${lat}_${lon}`;
    if (!venueMap.has(venueKey)) {
      venueMap.set(venueKey, { name, coordinates: { lat, lon }, events: [] });
    }
    venueMap.get(venueKey).events.push(event);
  }

  const knownCinemas = getAllCinemaAttributes();

  const results = [];
  for (const [, venue] of venueMap.entries()) {
    // Split venue name before matching (e.g., "BFI Southbank, London" -> "BFI Southbank")
    const [venueName] = venue.name.split(/[,|]/);
    const matchingCinema = findMatchingCinema(
      knownCinemas,
      venueName,
      venue.coordinates,
    );

    // Check if venue is in London
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
