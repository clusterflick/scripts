const path = require("node:path");
const { readJSON, basicNormalize } = require("../../common/utils");
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
    "designmynight.com",
  );
  const data = await readJSON(dataSrc);
  const movieListPages = data.movieListPages || [];

  // Get unique listings
  const uniqueListings = Object.values(
    movieListPages.reduce((acc, listing) => {
      acc[listing.designmynight_id] = listing;
      return acc;
    }, {}),
  );

  // Group listings by venue
  const venueMap = new Map();

  for (const listing of uniqueListings) {
    const { venue, location } = listing;
    if (!venue?.title) continue;

    const venueName = venue.title;
    const coordinates = location
      ? { lat: location.lat, lon: location.lon }
      : null;

    // Create a unique key for the venue
    const venueKey = coordinates
      ? `${basicNormalize(venueName)}_${coordinates.lat}_${coordinates.lon}`
      : basicNormalize(venueName);

    if (!venueMap.has(venueKey)) {
      venueMap.set(venueKey, {
        name: venueName,
        coordinates,
        events: [],
      });
    }
    venueMap.get(venueKey).events.push(listing);
  }

  const knownCinemas = await loadKnownCinemas();

  const results = [];
  for (const [, venue] of venueMap.entries()) {
    // Match by name and coordinates (or name-only if coordinates are null)
    const matchingCinema = findMatchingCinema(
      knownCinemas,
      venue.name,
      venue.coordinates,
    );

    // Only check if in London if we have coordinates
    const inLondon = venue.coordinates
      ? await isInLondon(venue.coordinates.lat, venue.coordinates.lon)
      : false;

    results.push({
      ...venue,
      inLondon,
      matchingCinema,
    });
  }

  return sortVenuesByEventCount(results);
}

module.exports = discoverVenues;
