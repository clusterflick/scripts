const path = require("node:path");
const cheerio = require("cheerio");
const { readJSON, basicNormalize, getText } = require("../../common/utils");
const {
  sortVenuesByEventCount,
  findMatchingCinema,
  extractPostcode,
} = require("../../common/source-utils");
const { getAllCinemaAttributes } = require("../../cinemas");

// Pull venue details from a Ticket Tailor listing page. The selectors mirror
// find-events.js parseEventsFromPage, but here we keep every event (including
// multi-date ones it skips) since discovery only cares about the venues.
function extractVenues(html) {
  const $ = cheerio.load(html);
  const venues = [];

  $(".events-listing__item").each((index, element) => {
    const $event = $(element);
    // Location text is "venue name, address, postcode"
    // (e.g. "Good Shepherd Studios, Leytonstone, E11 3DR")
    const locationText = getText($event.find(".event-meta__location"));
    if (!locationText) return;

    const eventUrl = $event.find(".event__title a").attr("href");
    venues.push({
      venueName: locationText.split(",")[0].trim(),
      locationText,
      url: eventUrl ? `https://www.tickettailor.com${eventUrl}` : null,
    });
  });

  return venues;
}

async function discoverVenues() {
  const dataSrc = path.join(
    process.cwd(),
    "retrieved-data",
    "tickettailor.com",
  );
  const data = await readJSON(dataSrc);
  const clubPages = data.clubPages || {};

  // Group events by venue. Ticket Tailor slugs are organisers/clubs, so each
  // one can run events at venues we don't yet know - that's what we surface.
  // Ticket Tailor gives no coordinates, only a location string, so we key on
  // the venue name and rely on postcode matching.
  const venueMap = new Map();

  for (const [slug, html] of Object.entries(clubPages)) {
    for (const venue of extractVenues(html)) {
      const { venueName, locationText, url } = venue;
      const venueKey = basicNormalize(venueName);

      if (!venueMap.has(venueKey)) {
        venueMap.set(venueKey, {
          name: venueName,
          coordinates: null,
          address: locationText,
          postcode: extractPostcode(locationText),
          events: [],
        });
      }
      venueMap
        .get(venueKey)
        .events.push({ url, venueName, locationText, slug });
    }
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
      // No coordinates, so London membership can't be computed; curated slugs
      // are London film clubs, so we surface every venue for triage.
      inLondon: false,
      matchingCinema,
    });
  }

  return sortVenuesByEventCount(results);
}

module.exports = discoverVenues;
