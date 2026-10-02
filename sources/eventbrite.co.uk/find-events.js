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
const {
  parseDate,
  getEventVenue,
  getEventDescription,
  getEventStatus,
} = require("./utils");
const attributes = require("./attributes");
const { venueMatchesCinema } = require("../../common/source-utils");
const { isNotNonFilmEvent } = require("../../common/is-non-film-event");
const { isLineUpEvent, expandLineUpEvent } = require("./expand-line-up-events");
const {
  getLineUpSeriesId,
  expandSeriesLineUp,
} = require("./expand-series-line-ups");

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

// Some Eventbrite organisers aren't the venue but film clubs who hire a screen
// for the night. For those, note the provenance on each performance so
// consumers can see who is putting the screening on. Keyed on the organiser id,
// which search results and organiser calendars both carry as
// `primary_organizer_id`, and worded as the organiser names itself on its own
// Eventbrite page.
const ORGANIZER_NOTES = {
  // https://www.eventbrite.co.uk/o/window-seat-cinema-club-121667174975
  121667174975: "Presented by Window Seat Cinema Club",
};

function convertEventbriteEvent(event, details) {
  const startDate = parseDate(`${event.start_date}T${event.start_time}`);
  const endDate = parseDate(`${event.end_date}T${event.end_time}`);
  const duration = (endDate.getTime() - startDate.getTime()) / 1000 / 60;
  const eventDescription = getEventDescription(details);

  const crewMatch = eventDescription.match(/Dir:(.*)\n/i);
  const castMatch = eventDescription.match(/Cast:(.*)\n/i);
  const overview =
    `Duration: ${duration}\n\n${event.summary}\n\n${eventDescription}`.trim();
  const note = ORGANIZER_NOTES[event.primary_organizer_id];

  return {
    showingId: generateShowingId(attributes, event.id),
    title: event.name,
    url: event.url,
    overview: createOverview({ duration }),
    performances: [
      createPerformance({
        date: startDate,
        notesList: note ? [note] : [],
        url: event.tickets_url,
        status: getEventStatus(details),
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
  let seriesEvents = {};
  try {
    const data = await readJSON(dataSrc);
    movieListPages = data.movieListPages;
    moviePages = data.moviePages;
    // Releases from before the organiser sweep have no such key.
    organizerEvents = data.organizerEvents || [];
    // Nor does any release from before series line-ups were expanded.
    seriesEvents = data.seriesEvents || {};
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

  // Every session of a series reads back the whole series, so whichever one
  // arrives first expands it and the rest are skipped.
  const expandedSeriesIds = new Set();

  return filteredEvents
    .flatMap((event) => {
      const details = moviePages[event.url];

      // A handful of listings pack a whole season of screenings into one event,
      // with the individual dates written out only in the body text.
      if (isLineUpEvent(event)) return expandLineUpEvent(event, details);

      // Others are a series whose sessions share a title, and only the body
      // text says which film plays on which night.
      const seriesId = getLineUpSeriesId(details);
      if (seriesId) {
        if (expandedSeriesIds.has(seriesId)) return [];
        expandedSeriesIds.add(seriesId);
        return expandSeriesLineUp(event, details, seriesEvents[seriesId]);
      }

      return convertEventbriteEvent(event, details);
    })
    .filter(isNotNonFilmEvent);
}

module.exports = findEvents;
