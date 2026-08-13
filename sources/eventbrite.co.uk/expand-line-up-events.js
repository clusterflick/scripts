const {
  basicNormalize,
  generateShowingId,
  createOverview,
  createPerformance,
  createAccessibility,
  createFormat,
  convertNamesTextToList,
} = require("../../common/utils");
const { parseDate, getEventDescription } = require("./utils");
const attributes = require("./attributes");

// Some organisers put a whole season behind a single Eventbrite listing: one
// event id, one start/end pair spanning weeks, and every individual screening
// described only in the body text. Eventbrite gives us nothing structured for
// those dates — no series, no sessions, no per-date ticket classes — so the
// listing would otherwise land as one showing with a duration measured in
// months.
//
// Where an organiser writes that body text to a consistent template we can read
// the season back out of it. This is deliberately an allow-list of event ids
// rather than a heuristic: guessing at prose across every long-running listing
// in the pull would invent screenings, and a wrong date is worse than a missing
// one.
const LINE_UP_EVENT_IDS = [
  // Film Tottenham presents Rebel Party — eight films at The Beehive Pub,
  // 30th August to 25th October 2026.
  "1996329278612",
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

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

// "Sunday 30th August: 6.30pm - Quadrophenia (1979) with post film discussion"
const LINE_UP_LINE =
  /^(\w+day)\s+(\d{1,2})(?:st|nd|rd|th)\s+(\w+)\s*:\s*(\d{1,2})[.:](\d{2})\s*(am|pm)\s*[-–—]\s*(.+)$/i;

// "Quadrophenia (1979)" — only treated as a synopsis heading when a "Director:"
// line follows it, so line-up entries and stray prose don't get picked up.
const FILM_HEADING = /^(.+?)\s*\((\d{4})\)\s*$/;
const FILM_FIELD =
  /^(Director|Cast|Running Time|Distributor|Rating)\s*:\s*(.*)$/i;

const isLineUpEvent = (event) => LINE_UP_EVENT_IDS.includes(`${event.id}`);

/**
 * Read the per-film synopsis blocks out of the description. Each block is a
 * "Title (Year)" heading followed by labelled fields and a prose synopsis.
 */
function parseFilmDetails(lines) {
  const headingIndexes = lines.reduce((indexes, line, index) => {
    if (!FILM_HEADING.test(line.trim())) return indexes;
    // Look ahead for the "Director:" line that confirms this is a heading and
    // not just a sentence that happens to end in a year.
    const isHeading = lines
      .slice(index + 1, index + 5)
      .some((nextLine) => /^Director\s*:/i.test(nextLine.trim()));
    return isHeading ? indexes.concat(index) : indexes;
  }, []);

  return headingIndexes.map((headingIndex, position) => {
    const [, title, year] = lines[headingIndex].trim().match(FILM_HEADING);
    const endIndex = headingIndexes[position + 1] ?? lines.length;

    const film = { title: title.trim(), year, synopsis: [] };
    for (const line of lines.slice(headingIndex + 1, endIndex)) {
      const trimmedLine = line.trim();
      if (trimmedLine === "") continue;

      const field = trimmedLine.match(FILM_FIELD);
      if (!field) {
        film.synopsis.push(trimmedLine);
        continue;
      }

      const [, label, value] = field;
      switch (basicNormalize(label)) {
        case "director":
          film.directors = value;
          break;
        case "cast":
          film.actors = value;
          break;
        case "running time":
          film.duration = parseInt(value, 10);
          break;
        case "rating":
          film.classification = value;
          break;
        // "Distributor:" is not something we surface, so drop it rather than
        // letting it fall into the synopsis.
        default:
          break;
      }
    }

    return { ...film, synopsis: film.synopsis.join("\n\n") };
  });
}

/**
 * Work out which year a "30th August" style date falls in by anchoring it to
 * the event's own start and end dates, rather than to the current date.
 */
function resolveDate(event, { day, month, hours, minutes }) {
  const startDate = parseDate(`${event.start_date}T${event.start_time}`);
  const endDate = parseDate(`${event.end_date}T${event.end_time}`);

  const candidates = [];
  for (let year = startDate.getFullYear(); year <= endDate.getFullYear(); ) {
    const candidate = new Date(year, month, day, hours, minutes);
    // The event's start/end are the times of the first and last screening, so
    // compare against the whole of those days.
    const isAfterStart = candidate >= new Date(startDate).setHours(0, 0, 0, 0);
    const isBeforeEnd =
      candidate <= new Date(endDate).setHours(23, 59, 59, 999);
    if (isAfterStart && isBeforeEnd) candidates.push(candidate);
    year += 1;
  }

  if (candidates.length !== 1) {
    throw new Error(
      `Unable to resolve a single year for ${day} ${MONTH_NAMES[month]} in event ${event.id} ` +
        `(range ${event.start_date} to ${event.end_date}, ${candidates.length} candidates)`,
    );
  }

  return candidates[0];
}

/**
 * Read the "Sunday 30th August: 6.30pm - Quadrophenia (1979) ..." schedule and
 * pair each entry with the film it names.
 */
function parseLineUp(event, lines, films) {
  return lines.reduce((lineUp, line) => {
    const match = line.trim().match(LINE_UP_LINE);
    if (!match) return lineUp;

    const [, dayName, day, monthName, hours, minutes, meridiem, remainder] =
      match;

    const month = MONTH_NAMES.indexOf(basicNormalize(monthName));
    if (month === -1) return lineUp;

    const film = films.find((film) =>
      basicNormalize(remainder).startsWith(
        basicNormalize(`${film.title} (${film.year})`),
      ),
    );
    if (!film) {
      throw new Error(
        `No synopsis found for line-up entry "${line.trim()}" in event ${event.id}`,
      );
    }

    const hours24 =
      (parseInt(hours, 10) % 12) + (basicNormalize(meridiem) === "pm" ? 12 : 0);
    const date = resolveDate(event, {
      day: parseInt(day, 10),
      month,
      hours: hours24,
      minutes: parseInt(minutes, 10),
    });

    const expectedDayName = DAY_NAMES[date.getDay()];
    if (basicNormalize(dayName) !== expectedDayName) {
      throw new Error(
        `Line-up entry "${line.trim()}" in event ${event.id} says ${dayName} but ` +
          `${date.toDateString()} is a ${expectedDayName}`,
      );
    }

    // Everything after the title is a description of what makes this screening
    // different — a post-film discussion, a Q&A with a named guest.
    const note = remainder.slice(`${film.title} (${film.year})`.length).trim();

    return lineUp.concat({ date, film, note });
  }, []);
}

/**
 * Turn one Eventbrite listing covering a season into one showing per film.
 */
function expandLineUpEvent(event, details) {
  const lines = getEventDescription(details).split("\n");
  const films = parseFilmDetails(lines);

  if (films.length === 0) {
    throw new Error(
      `Expected film details in the description of event ${event.id} but found none`,
    );
  }

  const lineUp = parseLineUp(event, lines, films);

  if (lineUp.length === 0) {
    throw new Error(
      `Expected a line-up in the description of event ${event.id} but found none`,
    );
  }

  return lineUp.map(({ date, film, note }) => {
    const isoDate = [
      date.getFullYear(),
      `${date.getMonth() + 1}`.padStart(2, "0"),
      `${date.getDate()}`.padStart(2, "0"),
    ].join("-");
    // Only this film's own synopsis, never the shared preamble — the preamble
    // talks about the season as a whole ("aim to show each film with
    // subtitles"), which would wrongly tag every screening.
    const overview = [film.synopsis, note].filter(Boolean).join("\n\n").trim();

    return {
      showingId: generateShowingId(attributes, `${event.id}-${isoDate}`),
      title: film.title,
      url: event.url,
      overview: createOverview({
        duration: film.duration,
        year: film.year,
        directors: film.directors,
        actors: film.actors,
        classification: film.classification,
      }),
      performances: [
        createPerformance({
          date,
          notesList: [note],
          url: event.tickets_url,
          accessibility: createAccessibility(film.title, {}, overview),
          format: createFormat(film.title, {}, overview),
        }),
      ],
      matchingHints: {
        overview,
        crew: film.directors
          ? convertNamesTextToList(film.directors)
          : undefined,
        cast: film.actors ? convertNamesTextToList(film.actors) : undefined,
      },
    };
  });
}

module.exports = {
  isLineUpEvent,
  expandLineUpEvent,
};
