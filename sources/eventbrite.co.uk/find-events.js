const path = require("node:path");
const {
  readJSON,
  basicNormalize,
  sanitizeRichText,
  generateShowingId,
} = require("../../common/utils");
const normalizeVenueName = require("../../common/normalize-venue-name");
const distanceInKmBetweenCoordinates = require("../../common/distance-in-km-between-coordinates");
const { createOverview, createPerformance } = require("../../common/utils");
const { parseDate } = require("./utils");
const attributes = require("./attributes");

function getEventDescriptiopn(details) {
  if (!details) return "";

  return (
    details.components?.eventDescription?.structuredContent?.modules
      .filter(({ type }) => basicNormalize(type) === "text")
      .map(({ text }) => sanitizeRichText(text))
      .join("\n\n") || ""
  );
}

function isExcludedEvent({ name }) {
  return basicNormalize(name).startsWith(
    // Exclude film clubs which only discuss the movie but don't have a showing
    basicNormalize("All Out of Bubblegum Film Club"),
  );
}

function convertEventbriteEvent(event, details) {
  const startDate = parseDate(`${event.start_date}T${event.start_time}`);
  const endDate = parseDate(`${event.end_date}T${event.end_time}`);
  const eventDescription = getEventDescriptiopn(details);

  return {
    showingId: generateShowingId(attributes, event.id),
    title: event.name,
    url: event.url,
    overview: createOverview({
      duration: (endDate.getTime() - startDate.getTime()) / 1000 / 60,
    }),
    performances: [
      createPerformance({
        date: startDate,
        notesList: [],
        url: event.tickets_url,
      }),
    ],
    matchingHints: {
      overview: `${event.summary}\n\n${eventDescription}`.trim(),
    },
  };
}

function uniqueEvents(events) {
  const ids = {};
  return events.filter((event) => {
    const isNewEvent = !ids[event.id];
    ids[event.id] = true;
    return isNewEvent;
  });
}

async function findEvents(cinema) {
  const dataSrc = path.join(
    process.cwd(),
    "retrieved-data",
    "eventbrite.co.uk",
  );
  let movieListPages = [];
  let moviePages = {};
  try {
    const data = await readJSON(dataSrc);
    movieListPages = data.movieListPages;
    moviePages = data.moviePages;
  } catch {
    // Source data may not always be available or required
  }

  const events = uniqueEvents(
    movieListPages.flatMap(({ search_data: { events } }) => events.results),
  );

  const filteredEvents = events.filter((event) => {
    if (event.is_cancelled || event.is_online_event) return false;
    if (isExcludedEvent(event)) return false;

    const {
      primary_venue: {
        name,
        address: { longitude: lon, latitude: lat },
      },
    } = event;
    const distance = distanceInKmBetweenCoordinates(cinema.geo, { lat, lon });
    const [venueName] = name.split(/[,|]/i);
    const names = (cinema.alternativeNames || []).concat(cinema.name);
    return (
      names.some(
        (name) => normalizeVenueName(venueName) === normalizeVenueName(name),
      ) && distance < 0.1
    );
  });

  return filteredEvents.map((event) =>
    convertEventbriteEvent(event, moviePages[event.url]),
  );
}

module.exports = findEvents;
