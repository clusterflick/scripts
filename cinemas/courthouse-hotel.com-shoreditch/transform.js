const { parse: parseDate, setHours, setMinutes } = require("date-fns");
const { parse: parseCsv } = require("csv-parse/sync");
const {
  generateShowingId,
  createOverview,
  createPerformance,
  createAccessibility,
  createFormat,
  basicNormalize,
} = require("../../common/utils");
const attributes = require("./attributes");

function parseTime(timeStr) {
  const match = timeStr.match(/^(\d+)(?:\.(\d+))?(AM|PM)$/i);
  if (!match) throw new Error(`Cannot parse time: ${timeStr}`);
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2] || "0", 10);
  const period = match[3].toUpperCase();
  if (period === "AM" && hours === 12) hours = 0;
  if (period === "PM" && hours !== 12) hours += 12;
  return { hours, minutes };
}

async function transform({ csvText }, sourcedEvents) {
  const rows = parseCsv(csvText, { columns: true, skip_empty_lines: true });
  const moviesByTitle = new Map();

  for (const row of rows) {
    const title = row.movie.trim();

    const date = parseDate(row.date, "dd-MMM-yy", new Date());
    const { hours, minutes } = parseTime(row.time);
    const performanceDate = setMinutes(setHours(date, hours), minutes);

    const normalizedTitle = basicNormalize(title);

    if (!moviesByTitle.has(normalizedTitle)) {
      moviesByTitle.set(normalizedTitle, {
        showingId: generateShowingId(attributes, normalizedTitle),
        title,
        url: attributes.url,
        overview: createOverview({}),
        performances: [],
        // The transcribed title keeps the year the poster prints alongside it,
        // which is what the movie db matcher reads the year out of, so there is
        // nothing further to hint with.
        matchingHints: {},
      });
    }

    moviesByTitle.get(normalizedTitle).performances.push(
      createPerformance({
        date: performanceDate,
        url: attributes.url,
        accessibility: createAccessibility(title, {}),
        format: createFormat(title, {}, ""),
      }),
    );
  }

  const movies = [...moviesByTitle.values()];

  // The programme runs every Sunday of the year, so an empty parse means the
  // CSV is missing or its columns have changed rather than a quiet season.
  // Past dates are not a concern here - sortAndFilterMovies drops those - so
  // this stays true right up to the point the next year's poster is published.
  if (movies.length === 0) {
    throw new Error("No movies found - the hosted CSV may have changed format");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
