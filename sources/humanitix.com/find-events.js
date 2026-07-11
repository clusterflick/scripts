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

function getEventUrl(event) {
  if (!event.hostname || !event.slug) {
    throw new Error(
      `humanitix event ${event._id} is missing hostname or slug for URL construction`,
    );
  }
  return new URL(event.slug, event.hostname).href;
}

function convertHumanitixEvent(event) {
  if (!event._id) {
    throw new Error("humanitix event is missing _id");
  }
  if (!event.name) {
    throw new Error(`humanitix event ${event._id} is missing name`);
  }
  if (!Array.isArray(event.dates) || event.dates.length === 0) {
    throw new Error(`humanitix event ${event._id} is missing dates`);
  }

  const url = getEventUrl(event);

  const performances = event.dates.map(({ startDate }) => {
    const date = new Date(startDate);
    if (Number.isNaN(date.getTime())) {
      throw new Error(
        `humanitix event ${event._id} has an unparseable startDate: ${startDate}`,
      );
    }
    return createPerformance({
      date,
      url,
      accessibility: createAccessibility(event.name, {}),
      format: createFormat(event.name, {}, ""),
    });
  });

  return {
    showingId: generateShowingId(attributes, event._id),
    title: event.name,
    url,
    overview: createOverview({}),
    performances,
    matchingHints: { overview: "" },
  };
}

async function findEvents(cinema) {
  const dataSrc = path.join(process.cwd(), "retrieved-data", "humanitix.com");

  let events = [];
  try {
    const data = await readJSON(dataSrc);
    events = data.events || [];
  } catch {
    // Source data may not always be available or required
    return [];
  }

  const filteredEvents = events.filter((event) => {
    const location = event.eventLocation;
    // Events without a physical venue (e.g. online) cannot match a cinema
    if (!location || !location.venueName) return false;

    // Humanitix events carry no coordinates, only an address string, so
    // matching falls back to venue name plus postcode extracted from the address
    return venueMatchesCinema(cinema, location.venueName, null, {
      eventAddress: location.address,
    });
  });

  return filteredEvents.map((event) => convertHumanitixEvent(event));
}

module.exports = findEvents;
