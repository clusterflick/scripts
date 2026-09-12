const path = require("node:path");
const {
  readJSON,
  basicNormalize,
  generateShowingId,
  createAccessibility,
  createFormat,
  convertNamesTextToList,
} = require("../../common/utils");
const { createOverview, createPerformance } = require("../../common/utils");
const { parseDate, getEventVenue, getEventDescription } = require("./utils");
const attributes = require("./attributes");
const { venueMatchesCinema } = require("../../common/source-utils");
const { isNotNonFilmEvent } = require("../../common/is-non-film-event");
const { isLineUpEvent, expandLineUpEvent } = require("./expand-line-up-events");

// Events recovered from an organiser's own calendar carry no `tags`:
// Eventbrite attaches them to search results only, and they are absent from the
// event page too. The tag rules below therefore can't speak to those events -
// the name rules still do, as does isNotNonFilmEvent further down.
function isExcludedEvent({ name, tags = [] }) {
  // Exclude events which are medical screenings
  if (
    tags.some(
      (tag) =>
        basicNormalize(tag.display_name).includes("medical") ||
        basicNormalize(tag.display_name).includes("healthcare"),
    )
  ) {
    return true;
  }

  return (
    // Exclude film clubs which only discuss the movie but don't have a showing
    basicNormalize(name).startsWith(
      basicNormalize("All Out of Bubblegum Film Club"),
    ) ||
    // Exclude Gaming events
    basicNormalize(name).includes(basicNormalize("Global Game Jam")) ||
    // Exclude online workshops
    basicNormalize(name).includes("online workshop")
  );
}

function convertEventbriteEvent(event, details) {
  const startDate = parseDate(`${event.start_date}T${event.start_time}`);
  const endDate = parseDate(`${event.end_date}T${event.end_time}`);
  const duration = (endDate.getTime() - startDate.getTime()) / 1000 / 60;
  const eventDescription = getEventDescription(details);

  const crewMatch = eventDescription.match(/Dir:(.*)\n/i);
  const castMatch = eventDescription.match(/Cast:(.*)\n/i);
  const overview =
    `Duration: ${duration}\n\n${event.summary}\n\n${eventDescription}`.trim();

  return {
    showingId: generateShowingId(attributes, event.id),
    title: event.name,
    url: event.url,
    overview: createOverview({ duration }),
    performances: [
      createPerformance({
        date: startDate,
        notesList: [],
        url: event.tickets_url,
        accessibility: createAccessibility(event.name, {}, overview),
        format: createFormat(event.name, {}, overview),
      }),
    ],
    matchingHints: {
      overview,
      crew: crewMatch ? convertNamesTextToList(crewMatch[1]) : undefined,
      cast: castMatch ? convertNamesTextToList(castMatch[1]) : undefined,
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
  let organizerEvents = [];
  try {
    const data = await readJSON(dataSrc);
    movieListPages = data.movieListPages;
    moviePages = data.moviePages;
    // Releases from before the organiser sweep have no such key.
    organizerEvents = data.organizerEvents || [];
  } catch {
    // Source data may not always be available or required
  }

  // Search results first: where the two overlap, the search carries the richer
  // event, and uniqueEvents keeps whichever it sees first.
  const events = uniqueEvents(
    movieListPages
      .flatMap(({ search_data: { events } }) => events.results)
      .concat(organizerEvents),
  );

  const filteredEvents = events.filter((event) => {
    if (event.is_cancelled || event.is_online_event) return false;
    if (isExcludedEvent(event)) return false;

    const venue = getEventVenue(event);
    if (!venue) return false;

    return venueMatchesCinema(cinema, venue.venueName, venue.coordinates, {
      eventAddress: venue.eventAddress,
    });
  });

  return filteredEvents
    .flatMap((event) =>
      // A handful of listings pack a whole season of screenings into one event,
      // with the individual dates written out only in the body text.
      isLineUpEvent(event)
        ? expandLineUpEvent(event, moviePages[event.url])
        : convertEventbriteEvent(event, moviePages[event.url]),
    )
    .filter(isNotNonFilmEvent);
}

module.exports = findEvents;
