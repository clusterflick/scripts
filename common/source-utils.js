const normalizeVenueName = require("./normalize-venue-name");
const distanceInKmBetweenCoordinates = require("./distance-in-km-between-coordinates");

// UK postcode regex - matches formats like "E11 3DR", "SE1 6ER", "SW1A 1AA"
const UK_POSTCODE_REGEX = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;

/**
 * Extract UK postcode from text (e.g., address string)
 * @param {string} text - Text containing a UK postcode
 * @returns {string|null} Normalized postcode or null if not found
 */
function extractPostcode(text) {
  if (!text) return null;
  const match = text.match(UK_POSTCODE_REGEX);
  return match ? match[1].toUpperCase().replace(/\s+/g, " ") : null;
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
 * @param {string} options.eventAddress - Optional address text from event to extract postcode for fallback matching
 * @returns {Object|undefined} Matching cinema or undefined
 */
function findMatchingCinema(
  knownCinemas,
  venueName,
  coordinates,
  options = {},
) {
  const {
    maxDistance = 0.35,
    supportMisconfiguredCoordinates = false,
    eventAddress,
  } = options;

  // Pre-extract event postcode for potential fallback matching
  const eventPostcode = extractPostcode(eventAddress);

  return knownCinemas.find((cinema) => {
    const names = (cinema.alternativeNames || []).concat(cinema.name);

    const nameMatches = names.some(
      (name) => normalizeVenueName(name) === normalizeVenueName(venueName),
    );

    // If no coordinates or postcode provided, match by name only
    if (!coordinates && !eventPostcode) {
      return nameMatches;
    }

    // Check distance
    const distance = distanceInKmBetweenCoordinates(cinema.geo, coordinates);
    const distanceCheck = supportMisconfiguredCoordinates
      ? distance < maxDistance || distance > 5000
      : distance < maxDistance;

    // If coordinates match, we have a match
    if (nameMatches && distanceCheck) {
      return true;
    }

    // Fallback: if name matches but coordinates don't, try postcode matching
    // This handles cases where sources have misconfigured coordinates
    if (nameMatches && eventPostcode) {
      const cinemaPostcode = extractPostcode(cinema.address);
      const isExactPostcodeMatch =
        cinemaPostcode && eventPostcode === cinemaPostcode;
      const isPartialPostcodeMatch =
        cinemaPostcode &&
        eventPostcode.split(/\s+/)[0] === cinemaPostcode.split(/\s+/)[0];
      if (isExactPostcodeMatch || isPartialPostcodeMatch) {
        return true;
      }
    }

    return false;
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
  sortVenuesByEventCount,
  findMatchingCinema,
  venueMatchesCinema,
  extractPostcode,
};
