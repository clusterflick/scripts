const { parse: parseDate, setHours, setMinutes } = require("date-fns");
const { parse: parseCsv } = require("csv-parse/sync");
const {
  generateShowingId,
  createOverview,
  createPerformance,
  createAccessibility,
  isPrivateHire,
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

    // Skip the Wimbledon showings, they're not movies
    if (title.toLowerCase().includes("wimbledon")) continue;
    if (isPrivateHire(title)) continue;

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
        matchingHints: {},
      });
    }

    moviesByTitle.get(normalizedTitle).performances.push(
      createPerformance({
        date: performanceDate,
        url: attributes.url,
        accessibility: createAccessibility(title, {}),
      }),
    );
  }

  const movies = [...moviesByTitle.values()];

  if (movies.length === 0) {
    throw new Error("No movies found - the CSV may be empty or malformed");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
