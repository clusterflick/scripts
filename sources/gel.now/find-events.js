const path = require("node:path");
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

function eventMatchesCinema(event, cinema, venuesById) {
  return (event.venues || []).some((venue) => {
    const fullVenue = venuesById.get(`${venue.id}`) || venue;
    const eventAddress = [fullVenue.address, fullVenue.city, fullVenue.postcode]
      .filter(Boolean)
      .join(", ");

    return venueMatchesCinema(cinema, fullVenue.name, null, { eventAddress });
  });
}

// Start times arrive as "2026-08-25T18:30:00Z", but the digits are the London
// wall-clock time the event is advertised at, not UTC - the descriptions say
// "18:30" and "3pm" for events stamped 18:30Z and 15:00Z. Taking the "Z" at
// face value puts every event an hour late through BST (and is right by
// accident through GMT). Drop the marker and parse as a local datetime, which
// is correct because the pipeline runs with TZ=Europe/London.
const parseStartTime = (startTime) => {
  if (!startTime) return undefined;
  const date = new Date(startTime.trim().replace(/Z$/, ""));
  return Number.isNaN(date.getTime()) ? undefined : date;
};

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
        date: parseStartTime(event.start_time),
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

  const { events = [], venues = [] } = data;
  const venuesById = new Map(venues.map((venue) => [`${venue.id}`, venue]));

  return events
    .filter((event) => eventMatchesCinema(event, cinema, venuesById))
    .map(buildEvent);
}

module.exports = findEvents;
