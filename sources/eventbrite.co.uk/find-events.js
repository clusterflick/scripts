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
  getFestivalCollectionNotes,
} = require("./utils");
const attributes = require("./attributes");
const { venueMatchesCinema } = require("../../common/source-utils");
const { isNotNonFilmEvent } = require("../../common/is-non-film-event");
const { isLineUpEvent, expandLineUpEvent } = require("./expand-line-up-events");
const {
  getLineUpSeriesId,
  expandSeriesLineUp,
} = require("./expand-series-line-ups");
const { getSeriesId } = require("./series-sessions");
const { buildTicketsUrl, splitLocalDateTime } = require("./organizer-events");

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

function convertEventbriteEvent(
  event,
  details,
  status = getEventStatus(details),
) {
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
        notesList: [note, ...getFestivalCollectionNotes(details, event.name)],
        url: event.tickets_url,
        status,
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

// `live` and `canceled` are the statuses sessions have been seen with. `started`
// is Eventbrite's documented status for an event under way, not yet seen here:
// a "current" session is one, and a run that lands mid-screening would
// otherwise fail on it. Anything else is a state nobody has decided how to
// publish, so it stops the run rather than guessing.
const PUBLISHED_SESSION_STATUSES = ["live", "started"];
const DROPPED_SESSION_STATUSES = ["canceled"];

/**
 * A session from the series endpoint, in the shape the search results use.
 *
 * The endpoint's `organizer_id` is the id the listings carry as
 * `primary_organizer_id`, which is what an organiser's note is keyed on.
 */
function sessionAsListing(session) {
  const name = session.name?.text;
  if (!name) {
    throw new Error(
      `Session ${session.id} of series ${session.series_id} has no name`,
    );
  }
  const [startDate, startTime] = splitLocalDateTime(
    session.start?.local,
    "start date",
    session.url,
  );
  const [endDate, endTime] = splitLocalDateTime(
    session.end?.local,
    "end date",
    session.url,
  );

  return {
    id: session.id,
    name,
    url: session.url,
    start_date: startDate,
    start_time: startTime,
    end_date: endDate,
    end_time: endTime,
    summary: session.summary || "",
    tickets_url: buildTicketsUrl(session.id),
    primary_organizer_id: session.organizer_id,
  };
}

/**
 * One showing per session of a series, each as it would be had the search
 * reached it.
 *
 * Every session shares the series' name, summary and description, and nothing
 * in the series says which film a session shows - most are a strand under one
 * title, a different film each month. So each stays its own showing, as the
 * sessions already reached have always been, and none is claimed to be another
 * screening of the same film.
 *
 * A session the search or an organiser calendar reached is published from that
 * listing and its own page, exactly as before. The rest are built from the
 * series, with the description of the page that was fetched - shared by every
 * session - and no availability, which only a session's own page reports.
 */
function convertSeriesSessions(
  event,
  details,
  sessions,
  listingsById,
  moviePages,
) {
  const { seriesId, venue } = details.props.pageProps.context.basicInfo;

  if (!sessions) {
    throw new Error(
      `Expected the sessions of series ${seriesId} to have been retrieved for event ${event.id}`,
    );
  }
  if (!venue?.id) {
    throw new Error(`Event ${event.id} of series ${seriesId} names no venue`);
  }

  return sessions.flatMap((session) => {
    if (DROPPED_SESSION_STATUSES.includes(session.status)) return [];
    if (!PUBLISHED_SESSION_STATUSES.includes(session.status)) {
      throw new Error(
        `Session ${session.id} of series ${seriesId} has status "${session.status}", ` +
          `which is neither published nor dropped`,
      );
    }
    if (`${session.venue_id}` !== `${venue.id}`) {
      throw new Error(
        `Session ${session.id} of series ${seriesId} is at venue ${session.venue_id}, ` +
          `not ${venue.id} where the rest of the series is`,
      );
    }

    const listing = listingsById.get(`${session.id}`);
    if (!listing) {
      return convertEventbriteEvent(sessionAsListing(session), details, {});
    }
    if (listing.is_cancelled || listing.is_online_event) return [];
    return convertEventbriteEvent(listing, moviePages[listing.url]);
  });
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
  // arrives first expands it and the rest are skipped. Any listing can stand
  // in for its session there, including one this venue's filter turned away,
  // so the lookup is over everything retrieved.
  const expandedSeriesIds = new Set();
  const listingsById = new Map(events.map((event) => [`${event.id}`, event]));

  return filteredEvents
    .flatMap((event) => {
      const details = moviePages[event.url];

      // A handful of listings pack a whole season of screenings into one event,
      // with the individual dates written out only in the body text.
      if (isLineUpEvent(event)) return expandLineUpEvent(event, details);

      // Others are a series, whose sessions are read from the series rather
      // than from however many of them the search happened to reach. That
      // includes an organiser's collapsed row, whose id is the series' own and
      // whose page carries the series' first ever date.
      const seriesId = getSeriesId(details);
      if (seriesId) {
        if (expandedSeriesIds.has(seriesId)) return [];
        expandedSeriesIds.add(seriesId);

        // A few say only in the body text which film plays on which night.
        if (getLineUpSeriesId(details)) {
          return expandSeriesLineUp(event, details, seriesEvents[seriesId]);
        }
        return convertSeriesSessions(
          event,
          details,
          seriesEvents[seriesId],
          listingsById,
          moviePages,
        );
      }

      return convertEventbriteEvent(event, details);
    })
    .filter(isNotNonFilmEvent);
}

module.exports = findEvents;
