const path = require("node:path");
const {
  createPerformance,
  createOverview,
  createAccessibility,
  createFormat,
  generateShowingId,
  readJSON,
} = require("../../common/utils");
const { venueMatchesCinema } = require("../../common/source-utils");
const attributes = require("./attributes");

// A festival sells its passes as events of their own ("DAY PASS - 29th
// October", "Full Festival Pass"), dated to the first screening they let you
// into. They are tickets to screenings listed separately, not screenings.
const isPass = (title) => /\b(?:day|festival|weekend)\s+pass\b/i.test(title);

const START_TIME = /^(\d{2}):(\d{2})(?::\d{2})?$/;

function parsePerformanceDate({ id, performance_date, show_start }) {
  const time = (show_start || "").trim().match(START_TIME);
  if (!time) {
    throw new Error(
      `Unable to read a start time for performance ${id} (received "${show_start}")`,
    );
  }

  // The date is midnight UTC on the London date and the time is London time,
  // so they are put together as a London local time.
  const [year, month, day] = performance_date.slice(0, 10).split("-");
  return new Date(year, month - 1, day, time[1], time[2]);
}

function parseEvent(event, performances) {
  const title = event.title.trim();
  const url = `${attributes.domain}/events/${event.slug || event.id}`;
  // The description opens with the dates and price, then describes the film -
  // for a shorts programme, each short with its director and country.
  const description = event.description || "";

  return {
    showingId: generateShowingId(attributes, event.id),
    title,
    url,
    // The performance's end time is the slot's, which takes in introductions
    // and Q&As, so it is not the film's length and is left off.
    overview: createOverview({}),
    performances: performances.map((performance) =>
      createPerformance({
        date: parsePerformanceDate(performance),
        url,
        status: { soldOut: performance.available_tickets <= 0 },
        accessibility: createAccessibility(title, {}, description),
        format: createFormat(title, {}, description),
      }),
    ),
    matchingHints: { overview: description },
  };
}

async function findEvents(cinema) {
  const dataSrc = path.join(process.cwd(), "retrieved-data", attributes.id);

  let data = {};
  try {
    data = await readJSON(dataSrc);
  } catch {
    return [];
  }

  const { events = [], performances = [], venues = [] } = data;
  const venuesById = new Map(venues.map((venue) => [venue.id, venue]));

  const results = [];
  for (const event of events) {
    if (isPass(event.title)) continue;

    const eventPerformances = performances.filter(
      ({ event_id }) => event_id === event.id,
    );
    if (eventPerformances.length === 0) continue;

    // An online screening has no venue, and nowhere to place it.
    if (!event.venue_id) continue;

    const venue = venuesById.get(event.venue_id);
    if (!venue) {
      throw new Error(
        `Unknown venue ${event.venue_id} for event ${event.id} ("${event.title}")`,
      );
    }

    const venueAddress = (venue.address || "").replace(/\s*\n\s*/g, ", ");
    if (
      venueMatchesCinema(cinema, venue.name, undefined, {
        eventAddress: venueAddress,
      })
    ) {
      results.push(parseEvent(event, eventPerformances));
    }
  }

  return results;
}

module.exports = findEvents;
