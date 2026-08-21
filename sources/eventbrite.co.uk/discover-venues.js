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
        address: {
          longitude: lon,
          latitude: lat,
          localized_address_display: address,
        },
      },
    } = event;

    // Create a unique key for the venue using name and approximate coordinates
    // Round coordinates to prevent slight variations from creating duplicate venues
    const venueKey = `${basicNormalize(name)}_${lat}_${lon}`;
    if (!venueMap.has(venueKey)) {
      venueMap.set(venueKey, {
        name,
        address,
        coordinates: { lat, lon },
        events: [],
      });
    }
    venueMap.get(venueKey).events.push(event);
  }

  const knownCinemas = getAllCinemaAttributes();

  const results = [];
  for (const [, venue] of venueMap.entries()) {
    // Split venue name before matching (e.g., "BFI Southbank, London" -> "BFI Southbank")
    const [venueName] = venue.name.split(/[,|]/);
    // Passing the address keeps discovery in step with find-events.js, which
    // matches on the same postcode fallback. Without it a venue whose pin sits
    // just outside the distance limit is reported as one we don't know about,
    // even while its events are being retrieved perfectly well.
    const matchingCinema = findMatchingCinema(
      knownCinemas,
      venueName,
      venue.coordinates,
      { eventAddress: venue.address },
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
