const cheerio = require("cheerio");
const { parse, isBefore, startOfDay, addYears, subDays } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const {
  getText,
  createPerformance,
  createOverview,
  generateShowingId,
  createAccessibility,
} = require("../../common/utils");
const attributes = require("./attributes");

const normalizeTime = (timeString) => {
  const cleanTime = timeString.replace(/\s+/g, " ").trim();
  // Normalize time format: replace "." with ":" and ensure minutes exist
  // "6pm" -> "6:00pm", "6:30pm" -> "6:30pm", "8.45pm" -> "8:45pm"
  let normalizedTime = cleanTime.replace(".", ":");
  if (!/:\d{2}/.test(normalizedTime)) {
    // No minutes found, add ":00"
    return normalizedTime.replace(/(\d+)(am|pm)/i, "$1:00$2");
  }
  return normalizedTime;
};

const createTimings = (doorsMatch, filmMatch, screeningsMatch) => {
  if (!doorsMatch && !filmMatch && !screeningsMatch) return null;

  const doorDesignator = (doorsMatch || [])[2];
  const filmDesignator = (filmMatch || [])[2];
  const screeningsDesignator = (screeningsMatch || [])[2];
  const designator = (doorDesignator || filmDesignator || screeningsDesignator)
    .toLowerCase()
    .replace("om", "pm");

  return {
    ...(doorsMatch
      ? { doors: normalizeTime(`${doorsMatch[1]}${designator}`) }
      : {}),
    ...(filmMatch
      ? { films: normalizeTime(`${filmMatch[1]}${designator}`) }
      : {}),
    ...(screeningsMatch
      ? { films: normalizeTime(`${screeningsMatch[1]}${designator}`) }
      : {}),
  };
};

const isRange = (year) => /[–—-]/.test(year);

function parseDate(dateString, timeString) {
  // Date format is like "Friday 14.11"
  const cleanDate = dateString.replace(/\s+/g, " ").trim();

  // Extract day name and date parts
  const [, datePart] = cleanDate.split(/\s+/);
  if (!datePart) return null;

  // Parse "14.11" format
  const [day, month] = datePart.split(".");
  if (!day || !month) return null;

  // Create date string in format "14-11 6:30pm"
  const dateStr = `${day.padStart(2, "0")}-${month.padStart(2, "0")} ${timeString}`;

  // Let date-fns handle the parsing with am/pm
  let parsedDate = parse(dateStr, "dd-MM h:mma", new Date(), {
    locale: enGB,
  });

  // It's unexpected to not find a parsable date, so throw
  if (isNaN(parsedDate.getTime())) throw new Error("Unable to parse date");

  // If the date is significantly the past, then it's probably on the year
  // boundary and we need to add a year. This is done by checking if it's a date
  // more than 19 days ago. We can't just check if it's before today as old
  // listings may be left up past the performance date.
  const tenDaysAgo = subDays(startOfDay(new Date()), 10);
  if (isBefore(parsedDate, tenDaysAgo)) {
    parsedDate = addYears(parsedDate, 1);
  }

  return parsedDate;
}

async function transform({ movieListPage }, sourcedEvents) {
  const $ = cheerio.load(movieListPage);
  const movies = [];

  // Find all movie listings
  $("main a.block").each(function () {
    const $row = $(this);

    const $cols = $row.find("section > div");
    const $detailsCol = $cols.eq(1); // Middle column with movie details
    const $bookingCol = $cols.eq(2); // Right column with date and booking

    const title = getText($detailsCol.children("p").first());

    const movieInfo = {};
    const times = [];
    const description = [];

    $detailsCol.contents().each(function () {
      const $el = $(this);
      const text = getText($el);

      if ($el.is("br")) return;
      if (text === title) return;
      if (!text.trim()) return;

      // Check if this contains year/director info (YYYY, Country, Director)
      const [, movieInfoText] = text.match(/^\s*\((\d{4}[^)]+)\)\s*$/) || [];
      if (movieInfoText) {
        const [year, , directors] = movieInfoText.split(",");
        movieInfo.year = isRange(year) ? undefined : year.trim();
        movieInfo.directors = directors.trim();
        return;
      }

      // Check if this contains "Doors", "Film", or "Screenings" timing
      // They can be on the same line: "Doors 6pm • Film 6:30pm"
      const doorsMatch = text.match(/Doors\s+([\d:.]+)(\s*[apo]m)?/i);
      const filmMatch = text.match(/Film\s+([\d:.]+)(\s*[apo]m)?/i);
      const screeningsMatch = text.match(/Screenings\s+([\d:.]+)(\s*[apo]m)?/i);
      const time = createTimings(doorsMatch, filmMatch, screeningsMatch);
      if (time) {
        times.push(time);
        return;
      }

      // Drop text mentioning double feature; the Nickel lists each performance
      // separately even if they're part of a double feature. Including this
      // text can confuse categorisation into identifying it as "movie marathon"
      if (text.match(/DOUBLE FEATURE/i)) return;

      // Everything else is part of the description
      description.push(text.trim());
    });

    // If there's no film time, the performance may be sold out and the times
    // removed from the page. The movie will be added again if it was captured
    // by a previous run as part of the missing movies functionality.
    if (!times.length === 0) return;

    // Extract date from booking column
    const bookingText = $bookingCol.text();
    const dateMatch = bookingText.match(
      /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*(\d+\.\d+)/i,
    );

    const bookingUrl = `${attributes.domain}${$row.attr("href").trim()}`;
    const performances = times.map(({ films: filmTime, doors: doorsTime }) => {
      const date = parseDate(`${dateMatch[1]} ${dateMatch[2]}`, filmTime);
      const notesList = [];
      if (doorsTime) notesList.push(`Doors ${doorsTime}`);
      return createPerformance({
        date,
        notesList,
        url: bookingUrl,
        accessibility: createAccessibility(title, {}),
      });
    });

    if (performances.length === 0) return;

    const [, id] = bookingUrl.match(/screening\/(\d+)/);
    const showingId = generateShowingId(attributes, id);

    const movie = {
      showingId,
      title,
      url: bookingUrl,
      overview: createOverview({
        year: movieInfo.year,
        directors: movieInfo.directors,
      }),
      performances,
      matchingHints: {
        overview: description
          .join("\n")
          .split("\n")
          .map((value) => value.trim())
          .filter((value) => !!value)
          .join("\n"),
      },
    };

    movies.push(movie);
  });

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
