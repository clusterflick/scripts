const cheerio = require("cheerio");
const { parse, isBefore, startOfDay, addYears } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const {
  getText,
  createPerformance,
  createOverview,
  generateShowingId,
} = require("../../common/utils");
const attributes = require("./attributes");

const isRange = (year) => /[–—-]/.test(year);

function parseDate(dateString, timeString) {
  // Date format is like "Friday 14.11" and time is like "6pm" or "6:30pm" or "8.45pm"
  const cleanDate = dateString.replace(/\s+/g, " ").trim();
  const cleanTime = timeString.replace(/\s+/g, " ").trim();

  // Extract day name and date parts
  const [, datePart] = cleanDate.split(/\s+/);
  if (!datePart) return null;

  // Parse "14.11" format
  const [day, month] = datePart.split(".");
  if (!day || !month) return null;

  // Normalize time format: replace "." with ":" and ensure minutes exist
  // "6pm" -> "6:00pm", "6:30pm" -> "6:30pm", "8.45pm" -> "8:45pm"
  let normalizedTime = cleanTime.replace(".", ":");
  if (!/:\d{2}/.test(normalizedTime)) {
    // No minutes found, add ":00"
    normalizedTime = normalizedTime.replace(/(\d+)(am|pm)/i, "$1:00$2");
  }

  // Create date string in format "14-11 6:30pm"
  const dateStr = `${day.padStart(2, "0")}-${month.padStart(2, "0")} ${normalizedTime}`;

  // Let date-fns handle the parsing with am/pm
  let parsedDate = parse(dateStr, "dd-MM h:mma", new Date(), {
    locale: enGB,
  });

  // It's unexpected to not find a parsable date, so throw
  if (isNaN(parsedDate.getTime())) throw new Error("Unable to parse date");

  // If the date is in the past, then it's probably on the year boundary
  // and we need to add a year
  const today = startOfDay(new Date());
  if (isBefore(parsedDate, today)) {
    parsedDate = addYears(parsedDate, 1);
  }

  return parsedDate;
}

async function transform({ movieListPage }, sourcedEvents) {
  const $ = cheerio.load(movieListPage);
  const movies = [];

  // Find all movie listings (div elements with grid-row attribute)
  $(".page_content [grid-row]").each(function () {
    const $row = $(this);

    const $cols = $row.find("[grid-col]");
    // Sometimes the column is empty, so skip it
    if (getText($cols).trim() === "") return;

    const $detailsCol = $cols.eq(1); // Middle column with movie details
    const $bookingCol = $cols.eq(2); // Right column with date and booking

    const title = getText($detailsCol.children("b").first());

    const movieInfo = {};
    let doorsTime = null;
    let filmTime = null;
    const description = [];

    $detailsCol.contents().each(function () {
      const $el = $(this);
      const text = getText($el);

      if ($el.is("br")) return;
      if ($el.is("b") && text === title) return;
      if (!text.trim()) return;

      // Check if this contains year/director info (YYYY, Country, Director)
      const [, movieInfoText] = text.match(/^\s*\(([^)]+)\)\s*$/) || [];
      if (movieInfoText) {
        const [year, , directors] = movieInfoText.split(",");
        movieInfo.year = isRange(year) ? undefined : year.trim();
        movieInfo.directors = directors.trim();
        return;
      }

      // Check if this contains "Doors" and/or "Film" timing
      // They can be on the same line: "Doors 6pm • Film 6:30pm"
      const doorsMatch = text.match(/Doors\s+([\d:.]+\s*[ap]m)/i);
      const filmMatch = text.match(/Film\s+([\d:.]+\s*[ap]m)/i);
      if (doorsMatch) doorsTime = doorsMatch[1];
      if (filmMatch) filmTime = filmMatch[1];
      if (doorsMatch || filmMatch) return;

      // Drop text mentioning double feature; the Nickel lists each performance
      // separately even if they're part of a double feature. Including this
      // text can confuse categorisation into identifying it as "movie marathon"
      if (text.match(/DOUBLE FEATURE/i)) return;

      // Everything else is part of the description
      description.push(text.trim());
    });

    // Extract date from booking column
    const bookingText = $bookingCol.text();
    const dateMatch = bookingText.match(
      /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*(\d+\.\d+)/i,
    );
    const date = parseDate(`${dateMatch[1]} ${dateMatch[2]}`, filmTime);
    const bookingUrl = $bookingCol.find("a").attr("href");
    const [, id] = bookingUrl.match(/event\/id\/(\d+)/);
    const showingId = generateShowingId(attributes, id);
    const notesList = [];
    if (doorsTime) notesList.push(`Doors ${doorsTime}`);

    const movie = {
      showingId,
      title,
      url: `${attributes.domain}/#:~:text=${encodeURIComponent(title)}`,
      overview: createOverview({
        year: movieInfo.year,
        directors: movieInfo.directors,
      }),
      performances: [
        createPerformance({
          date,
          notesList,
          url: bookingUrl,
        }),
      ],
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
