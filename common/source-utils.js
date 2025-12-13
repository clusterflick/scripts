const path = require("node:path");
const getModuleNamesFor = require("./get-module-names-for");
const normalizeVenueName = require("./normalize-venue-name");
const distanceInKmBetweenCoordinates = require("./distance-in-km-between-coordinates");

/**
 * Load all known cinema attributes from the cinemas directory
 * @returns {Promise<Array>} Array of cinema attribute objects
 */
async function loadKnownCinemas() {
  const cinemasPath = path.join(process.cwd(), "cinemas");
  const cinemaSlugs = await getModuleNamesFor(cinemasPath);
  return cinemaSlugs.map(
    (slug) => require(path.join(cinemasPath, slug)).attributes,
  );
}

/**
 * Sort venues by event count (descending)
 * @param {Array} venues - Array of venue objects with events property
 * @returns {Array} Sorted array of venues
 */
function sortVenuesByEventCount(venues) {
  return venues.sort((a, b) => b.events.length - a.events.length);
}

/**
 * Find a matching cinema for a venue based on name and distance
 * @param {Array} knownCinemas - Array of cinema attribute objects
 * @param {string} venueName - Name of the venue to match (caller should pre-split if needed)
 * @param {Object|null} coordinates - Venue coordinates {lat, lon}, or null for name-only matching
 * @param {Object} options - Optional configuration
 * @param {number} options.maxDistance - Maximum distance in km (default: 0.35)
 * @param {boolean} options.supportMisconfiguredCoordinates - Allow ridiculously far distances (> 5000km) for misconfigured data (default: false)
 * @returns {Object|undefined} Matching cinema or undefined
 */
function findMatchingCinema(
  knownCinemas,
  venueName,
  coordinates,
  options = {},
) {
  const { maxDistance = 0.35, supportMisconfiguredCoordinates = false } =
    options;

  return knownCinemas.find((cinema) => {
    const names = (cinema.alternativeNames || []).concat(cinema.name);

    const nameMatches = names.some(
      (name) => normalizeVenueName(name) === normalizeVenueName(venueName),
    );

    // If no coordinates provided, match by name only
    if (!coordinates) {
      return nameMatches;
    }

    // Check distance
    const distance = distanceInKmBetweenCoordinates(cinema.geo, coordinates);
    const distanceCheck = supportMisconfiguredCoordinates
      ? distance < maxDistance || distance > 5000
      : distance < maxDistance;

    return nameMatches && distanceCheck;
  });
}

/**
 * Check if a venue matches a specific cinema (used by findEvents functions)
 * @param {Object} cinema - Cinema object with name, alternativeNames, and geo
 * @param {string} venueName - Name of the venue to match
 * @param {Object|null} coordinates - Venue coordinates {lat, lon}, or null for name-only matching
 * @param {Object} options - Optional configuration
 * @param {number} options.maxDistance - Maximum distance in km
 * @param {boolean} options.supportMisconfiguredCoordinates - Allow ridiculously far distances (> 5000km) for misconfigured data (default: false)
 * @returns {boolean} True if venue matches the cinema
 */
function venueMatchesCinema(cinema, venueName, coordinates, options = {}) {
  const matchingCinema = findMatchingCinema(
    [cinema],
    venueName,
    coordinates,
    options,
  );
  return !!matchingCinema;
}

module.exports = {
  loadKnownCinemas,
  sortVenuesByEventCount,
  findMatchingCinema,
  venueMatchesCinema,
};
