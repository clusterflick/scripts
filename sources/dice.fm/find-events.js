const path = require("node:path");
const {
  createOverview,
  createPerformance,
  readJSON,
  generateShowingId,
  createAccessibility,
} = require("../../common/utils");
const attributes = require("./attributes");
const { venueMatchesCinema } = require("../../common/source-utils");

function convertDiceEvent(event) {
  const url = `https://dice.fm/event/${event.perm_name}`;
  const eventId = event.perm_name.match(/^([^-]+)/)?.[1];

  const startDate = new Date(event.dates.event_start_date);
  const endDate = new Date(event.dates.event_end_date);

  return {
    showingId: generateShowingId(attributes, eventId),
    title: event.name,
    url,
    overview: createOverview({
      duration: (endDate.getTime() - startDate.getTime()) / 1000 / 60,
    }),
    performances: [
      createPerformance({
        date: startDate,
        url,
        accessibility: createAccessibility(event.name, {}),
      }),
    ],
    matchingHints: {
      overview: event.about?.description || "",
    },
  };
}

async function findEvents(cinema) {
  const dataSrc = path.join(process.cwd(), "retrieved-data", "dice.fm");

  let events = [];
  try {
    const data = await readJSON(dataSrc);
    events = data.events || [];
  } catch {
    // Source data may not always be available or required
  }

  const filteredEvents = events.filter((event) => {
    const venue = event.venues?.[0];
    if (!venue) return false;

    const coordinates = {
      lat: venue.location.lat,
      lon: venue.location.lng,
    };
    return venueMatchesCinema(cinema, venue.name, coordinates, {
      eventAddress: venue.address,
    });
  });

  const uniqueEvents = filteredEvents.filter(
    (event, index, self) =>
      self.findIndex((e) => e.perm_name === event.perm_name) === index,
  );

  return uniqueEvents.map((event) => convertDiceEvent(event));
}

module.exports = findEvents;
