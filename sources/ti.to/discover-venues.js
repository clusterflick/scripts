const path = require("node:path");
const cheerio = require("cheerio");
const { readJSON, basicNormalize, getText } = require("../../common/utils");
const { isInLondon } = require("../../common/geo-utils");
const {
  sortVenuesByEventCount,
  findMatchingCinema,
} = require("../../common/source-utils");
const { getAllCinemaAttributes } = require("../../cinemas");

// Extract lat/lon from a Google Maps URL's "q" parameter
// (e.g. https://maps.google.com/maps?q=51.5,-0.1+%28...%29). Mirrors the
// coordinate parsing in find-events.js but returns null instead of throwing,
// so a single odd page can't abort discovery.
function extractCoordinates(href) {
  try {
    const q = new URL(href).searchParams.get("q");
    const match = q && q.match(/^([-\d.]+),([-\d.]+)/);
    if (!match) return null;
    return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
  } catch {
    return null;
  }
}

// Pull just the venue details (name, address, coordinates) from a Tito event
// page. The selectors mirror find-events.js extractEventDetails, but we skip
// title/date parsing since discovery only cares about the venue.
function extractVenue(html) {
  const $ = cheerio.load(html);
  const venueAddress = getText($(".tito-venues li a span"));
  if (!venueAddress) return null;

  const locationHref = $(".tito-event-homepage--basic-info-location a").attr(
    "href",
  );
  const coordinates = locationHref ? extractCoordinates(locationHref) : null;

  return {
    // First segment of the venue address is the venue name
    venueName: venueAddress.split(",")[0].trim(),
    venueAddress,
    coordinates,
  };
}

async function discoverVenues() {
  const dataSrc = path.join(process.cwd(), "retrieved-data", "ti.to");
  const data = await readJSON(dataSrc);

  // Group events by venue. Tito slugs are organisers/clubs, so each one can
  // run events at venues we don't yet know - that's what we're surfacing here.
  const venueMap = new Map();

  for (const [slug, venueData] of Object.entries(data)) {
    const moviePages = venueData?.moviePages;
    if (!moviePages) continue;

    for (const [url, html] of Object.entries(moviePages)) {
      const venue = extractVenue(html);
      if (!venue) continue;

      const { venueName, venueAddress, coordinates } = venue;
      const venueKey = coordinates
        ? `${basicNormalize(venueName)}_${coordinates.lat}_${coordinates.lon}`
        : basicNormalize(venueName);

      if (!venueMap.has(venueKey)) {
        venueMap.set(venueKey, {
          name: venueName,
          coordinates,
          address: venueAddress,
          events: [],
        });
      }
      venueMap.get(venueKey).events.push({ url, venueName, coordinates, slug });
    }
  }

  const knownCinemas = getAllCinemaAttributes();

  const results = [];
  for (const [, venue] of venueMap.entries()) {
    // Match by coordinates (primary), falling back to name + postcode
    const matchingCinema = findMatchingCinema(
      knownCinemas,
      venue.name,
      venue.coordinates,
      { eventAddress: venue.address },
    );

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
