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
 * Check whether a venue's name matches a cinema's name or any of its
 * alternative names
 * @param {Object} cinema - Cinema object with name and alternativeNames
 * @param {string} venueName - Name of the venue to match
 * @returns {boolean} True if any known name for the cinema matches
 */
function cinemaNameMatches(cinema, venueName) {
  const names = (cinema.alternativeNames || []).concat(cinema.name);
  return names.some(
    (name) => normalizeVenueName(name) === normalizeVenueName(venueName),
  );
}

/**
 * Check whether a venue is at the same place as a cinema, ignoring its name
 * @param {Object} cinema - Cinema object with geo and address
 * @param {Object|null} coordinates - Venue coordinates {lat, lon}, or null
 * @param {string|null} eventPostcode - Postcode extracted from the event address, or null
 * @param {Object} options - Optional configuration
 * @param {number} options.maxDistance - Maximum distance in km (default: 0.35)
 * @param {boolean} options.supportMisconfiguredCoordinates - Allow ridiculously far distances (> 5000km) for misconfigured data (default: false)
 * @returns {Object|null} Details of how the location matched, or null if it doesn't
 */
function getLocationMatch(cinema, coordinates, eventPostcode, options = {}) {
  const { maxDistance = 0.35, supportMisconfiguredCoordinates = false } =
    options;

  if (coordinates) {
    const distance = distanceInKmBetweenCoordinates(cinema.geo, coordinates);
    const isMisconfigured = distance > 5000;
    if (distance < maxDistance) {
      return { type: "distance", distance };
    }
    if (supportMisconfiguredCoordinates && isMisconfigured) {
      return { type: "misconfigured-coordinates", distance };
    }
  }

  // Postcodes cover for coordinates that are missing or misconfigured. An
  // outward code on its own ("E11") is a whole district rather than a
  // building, so it's reported separately from a full postcode match.
  if (eventPostcode) {
    const cinemaPostcode = extractPostcode(cinema.address);
    if (cinemaPostcode) {
      if (eventPostcode === cinemaPostcode) {
        return { type: "postcode", postcode: cinemaPostcode };
      }
      if (eventPostcode.split(/\s+/)[0] === cinemaPostcode.split(/\s+/)[0]) {
        return { type: "postcode-area", postcode: cinemaPostcode };
      }
    }
  }

  return null;
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
  const { eventAddress } = options;

  // Pre-extract event postcode for potential fallback matching
  const eventPostcode = extractPostcode(eventAddress);

  return knownCinemas.find((cinema) => {
    if (!cinemaNameMatches(cinema, venueName)) return false;

    // If no coordinates or postcode provided, match by name only
    if (!coordinates && !eventPostcode) return true;

    return !!getLocationMatch(cinema, coordinates, eventPostcode, options);
  });
}

/**
 * Find every cinema a venue could be at, ignoring its name entirely. Used to
 * surface venues rejected only because their name isn't one we know about.
 * @param {Array} knownCinemas - Array of cinema attribute objects
 * @param {Object|null} coordinates - Venue coordinates {lat, lon}, or null
 * @param {Object} options - Optional configuration
 * @param {number} options.maxDistance - Maximum distance in km (default: 0.35)
 * @param {boolean} options.supportMisconfiguredCoordinates - Allow ridiculously far distances (> 5000km) for misconfigured data (default: false)
 * @param {string} options.eventAddress - Optional address text from event to extract postcode
 * @returns {Array} Array of { cinema, locationMatch } for each cinema at the venue's location
 */
function findCinemasMatchingLocation(knownCinemas, coordinates, options = {}) {
  const eventPostcode = extractPostcode(options.eventAddress);

  return knownCinemas
    .map((cinema) => ({
      cinema,
      locationMatch: getLocationMatch(
        cinema,
        coordinates,
        eventPostcode,
        options,
      ),
    }))
    .filter(({ locationMatch }) => locationMatch !== null);
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
  cinemaNameMatches,
  findMatchingCinema,
  findCinemasMatchingLocation,
  venueMatchesCinema,
  extractPostcode,
};
