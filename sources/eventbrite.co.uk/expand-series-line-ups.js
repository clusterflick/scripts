const {
  basicNormalize,
  generateShowingId,
  createOverview,
  createPerformance,
  createAccessibility,
  createFormat,
} = require("../../common/utils");
const { parseDate, getEventDescription, getEventStatus } = require("./utils");
const { buildTicketsUrl } = require("./organizer-events");
const attributes = require("./attributes");

// Some organisers run a short season as an Eventbrite series: one event per
// night, all sharing a title, with which film plays on which night written only
// in the description. Unlike expand-line-up-events.js, Eventbrite does give us
// the dates here, as the series' own sessions, each with its own id, start time
// and checkout. What it doesn't give is the film, so the description's line-up
// is read for that and nothing else, and each entry is paired with the session
// on its date.
//
// Unexpanded, the search reaches one session and the organiser sweep drops the
// rest on their title, so the season lands as a single "multiple movies"
// showing on its first night.
//
// An allow-list of series ids for the same reason expand-line-up-events.js is
// one: guessing at prose across every series in the pull would invent
// screenings.
const LINE_UP_SERIES_IDS = [
  // The Griffin, Whetstone - Halloween on the Screen, five films across five
  // nights, 26th to 30th October 2026.
  // https://www.eventbrite.co.uk/e/halloween-on-the-screen-at-the-griffin-tickets-2002715002484
  "2002714960358",
];

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

// "🧙 Monday 26th: The Craft" - with whatever emoji the organiser leads with,
// and no month, since the sessions supply it.
const LINE_UP_LINE =
  /^[^\p{L}\p{N}]*(\p{L}+day)\s+(\d{1,2})(?:st|nd|rd|th)?\s*:\s*(.+)$/iu;

// "Hocus Pocus (with Halloween Party to follow £10 a ticket)" - the bracket is
// billing for that night rather than part of the film's name.
const TITLE_WITH_NOTE = /^(.+?)\s*\(([^()]+)\)\s*$/;

/**
 * The series id of an event page, if it is one whose line-up we read.
 */
function getLineUpSeriesId(details) {
  const basicInfo = details?.props?.pageProps?.context?.basicInfo;
  if (!basicInfo?.isSeries) return null;
  const seriesId = `${basicInfo.seriesId}`;
  return LINE_UP_SERIES_IDS.includes(seriesId) ? seriesId : null;
}

function parseLineUp(description) {
  return description.split("\n").reduce((lineUp, line) => {
    const match = line.trim().match(LINE_UP_LINE);
    if (!match) return lineUp;

    const [, dayName, day, remainder] = match;
    if (!DAY_NAMES.includes(basicNormalize(dayName))) return lineUp;

    const titleWithNote = remainder.trim().match(TITLE_WITH_NOTE);
    const [title, note] = titleWithNote
      ? [titleWithNote[1], titleWithNote[2]]
      : [remainder.trim(), undefined];

    return lineUp.concat({
      line: line.trim(),
      dayName: basicNormalize(dayName),
      day: parseInt(day, 10),
      title: title.trim(),
      note: note?.trim(),
    });
  }, []);
}

/**
 * Pair each session of the series with the line-up entry naming its date.
 *
 * Every session must be claimed by exactly one entry. An entry may go
 * unclaimed only if it comes before every claimed one: the series lists its
 * current and future sessions, so a night that has been and gone drops out of
 * it while the description still names it.
 */
function pairSessions(seriesId, lineUp, sessions) {
  const pairs = sessions.map((session) => {
    const date = parseDate(session.start.local.slice(0, 16));
    const entries = lineUp.filter(({ day }) => day === date.getDate());
    if (entries.length !== 1) {
      throw new Error(
        `Expected one line-up entry for the ${date.toDateString()} session ` +
          `(${session.id}) of series ${seriesId}, found ${entries.length}`,
      );
    }

    const [entry] = entries;
    const expectedDayName = DAY_NAMES[date.getDay()];
    if (entry.dayName !== expectedDayName) {
      throw new Error(
        `Line-up entry "${entry.line}" in series ${seriesId} says ${entry.dayName} ` +
          `but ${date.toDateString()} is a ${expectedDayName}`,
      );
    }

    return { session, date, entry };
  });

  const claimed = pairs.map(({ entry }) => lineUp.indexOf(entry));
  if (new Set(claimed).size !== claimed.length) {
    throw new Error(
      `More than one session of series ${seriesId} claims the same line-up entry`,
    );
  }
  const firstClaimed = Math.min(...claimed);
  const strandedEntry = lineUp.find(
    (entry, index) => index > firstClaimed && !claimed.includes(index),
  );
  if (strandedEntry) {
    throw new Error(
      `Line-up entry "${strandedEntry.line}" in series ${seriesId} has no session`,
    );
  }

  return pairs;
}

/**
 * Turn the sessions of a series into one showing per night, each titled with
 * the film the description gives that night.
 *
 * `details` is the event page retrieve fetched, which is one of the sessions,
 * so it is the only one whose ticket availability we know.
 */
function expandSeriesLineUp(event, details, sessions) {
  const {
    id: fetchedSessionId,
    seriesId,
    venue,
  } = details.props.pageProps.context.basicInfo;

  if (!sessions || sessions.length === 0) {
    throw new Error(
      `Expected the sessions of series ${seriesId} to have been retrieved for event ${event.id}`,
    );
  }

  const lineUp = parseLineUp(getEventDescription(details));
  if (lineUp.length === 0) {
    throw new Error(
      `Expected a line-up in the description of series ${seriesId} but found none`,
    );
  }

  // A cancelled night still claims its line-up entry, so that the entry isn't
  // reported as missing a session, but publishes nothing.
  const isCancelled = ({ status }) => status === "canceled";
  for (const session of sessions.filter((session) => !isCancelled(session))) {
    if (`${session.venue_id}` !== `${venue.id}`) {
      throw new Error(
        `Session ${session.id} of series ${seriesId} is at venue ${session.venue_id}, ` +
          `not ${venue.id} where the rest of the series is`,
      );
    }
  }

  return pairSessions(seriesId, lineUp, sessions)
    .filter(({ session }) => !isCancelled(session))
    .map(({ session, date, entry }) => {
      const endDate = parseDate(session.end.local.slice(0, 16));
      const duration = (endDate.getTime() - date.getTime()) / 1000 / 60;
      // Only this night's film, never the description as a whole: that names
      // all of them, and is what had the season categorised as one showing of
      // several films.
      const overview = [entry.title, event.summary, entry.note]
        .filter(Boolean)
        .join("\n\n");
      const isFetchedSession = `${session.id}` === `${fetchedSessionId}`;

      return {
        showingId: generateShowingId(attributes, session.id),
        title: entry.title,
        url: session.url,
        overview: createOverview({ duration }),
        performances: [
          createPerformance({
            date,
            notesList: [entry.note],
            url: buildTicketsUrl(session.id),
            // The series endpoint carries no availability, so only the
            // session whose page was fetched can say whether it has sold out.
            status: isFetchedSession ? getEventStatus(details) : {},
            accessibility: createAccessibility(entry.title, {}, overview),
            format: createFormat(entry.title, {}, overview),
          }),
        ],
        matchingHints: { overview },
      };
    });
}

module.exports = {
  getLineUpSeriesId,
  expandSeriesLineUp,
};
