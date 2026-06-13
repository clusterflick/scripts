const path = require("node:path");
const { readJSON, basicNormalize } = require("../../common/utils");
const {
  sortVenuesByEventCount,
  findMatchingCinema,
} = require("../../common/source-utils");
const { getAllCinemaAttributes } = require("../../cinemas");

function getEventUrl(event) {
  if (!event.hostname || !event.slug) return null;
  return new URL(event.slug, event.hostname).href;
}

async function discoverVenues() {
  const dataSrc = path.join(process.cwd(), "retrieved-data", "humanitix.com");
  const data = await readJSON(dataSrc);
  const events = data.events || [];

  // Group events by venue. Humanitix events carry no coordinates, only an
  // address string, so we key on the venue name and rely on postcode matching.
  const venueMap = new Map();

  for (const event of events) {
    const location = event.eventLocation;
    // Events without a physical venue (e.g. online) can't map to a cinema
    if (!location || !location.venueName) continue;

    const venueName = location.venueName;
    const venueKey = basicNormalize(venueName);

    if (!venueMap.has(venueKey)) {
      venueMap.set(venueKey, {
        name: venueName,
        coordinates: null,
        address: location.address || null,
        events: [],
      });
    }
    venueMap.get(venueKey).events.push({
      url: getEventUrl(event),
      venueName,
      address: location.address || null,
    });
  }

  const knownCinemas = getAllCinemaAttributes();

  const results = [];
  for (const [, venue] of venueMap.entries()) {
    // No coordinates available - match by name with postcode fallback
    const matchingCinema = findMatchingCinema(knownCinemas, venue.name, null, {
      eventAddress: venue.address,
    });

    results.push({
      ...venue,
      // Humanitix is queried with a London geobox, so every venue is already
      // London-scoped; we can't compute inLondon without coordinates.
      inLondon: false,
      matchingCinema,
    });
  }

  return sortVenuesByEventCount(results);
}

module.exports = discoverVenues;
