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

  const { events = [], venues = [] } = data;
  const venuesById = new Map(venues.map((venue) => [`${venue.id}`, venue]));

  return events
    .filter((event) => eventMatchesCinema(event, cinema, venuesById))
    .map(buildEvent);
}

module.exports = findEvents;
