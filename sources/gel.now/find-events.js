const path = require("node:path");
const cheerio = require("cheerio");
const {
  readJSON,
  generateShowingId,
  createOverview,
  createPerformance,
  createAccessibility,
  createFormat,
} = require("../../common/utils");
const { venueMatchesCinema } = require("../../common/source-utils");
const attributes = require("./attributes");

// The event page always links to its venue ("/venues/241") even though the
// events API doesn't expose that relationship - the venue's own address and
// postcode live in the separate venues API instead, keyed by that id.
function extractVenueId(html) {
  const $ = cheerio.load(html);
  const href = $('a[href^="/venues/"]').first().attr("href");
  const match = href && href.match(/^\/venues\/(\d+)/);
  return match ? match[1] : null;
}

function buildEvent(event) {
  const url = `${attributes.domain}/events/${event.id}`;
  const bookingUrl = event.external_url || url;

  return {
    showingId: generateShowingId(attributes, event.id),
    title: event.name,
    url,
    overview: createOverview({}),
    performances: [
      createPerformance({
        date: new Date(event.start_time),
        url: bookingUrl,
        notesList: [],
        accessibility: createAccessibility(event.name, {}, event.description),
        format: createFormat(event.name, {}, event.description),
      }),
    ],
    matchingHints: { overview: event.description },
  };
}

async function findEvents(cinema) {
  const dataSrc = path.join(process.cwd(), "retrieved-data", "gel.now");

  let data = {};
  try {
    data = await readJSON(dataSrc);
  } catch {
    return [];
  }

  const { events = [], eventPages = {}, venues = [] } = data;
  const venuesById = new Map(venues.map((venue) => [`${venue.id}`, venue]));

  const matchedEvents = [];
  for (const event of events) {
    const html = eventPages[event.id];
    if (!html) continue;

    const venueId = extractVenueId(html);
    if (!venueId) continue;

    const venue = venuesById.get(venueId);
    if (!venue) continue;

    const eventAddress = [venue.address, venue.city, venue.postcode]
      .filter(Boolean)
      .join(", ");

    if (!venueMatchesCinema(cinema, venue.name, null, { eventAddress })) {
      continue;
    }

    matchedEvents.push(buildEvent(event));
  }

  return matchedEvents;
}

module.exports = findEvents;
