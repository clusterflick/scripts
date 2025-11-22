const cheerio = require("cheerio");
const { parse, isBefore, startOfDay, addYears, subDays } = require("date-fns");
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

  // If the date is significantly the past, then it's probably on the year
  // boundary and we need to add a year. This is done by checking if it's a date
  // more than 5 days ago. We can't just check if it's before today as old
  // listings may be left up past the performance date.
  const fiveDaysAgo = subDays(startOfDay(new Date()), 5);
  if (isBefore(parsedDate, fiveDaysAgo)) {
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
    const times = [];
    const description = [];

    $detailsCol.contents().each(function () {
      const $el = $(this);
      const text = getText($el);

      if ($el.is("br")) return;
      if ($el.is("b") && text === title) return;
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
      const doorsMatch = text.match(/Doors\s+([\d:.]+\s*[ap]m)/i);
      const filmMatch = text.match(/Film\s+([\d:.]+\s*[ap]m)/i);
      const screeningsMatch = text.match(/Screenings\s+([\d:.]+\s*[ap]m)/i);
      // This assumes the door match will always occur before the film or
      // screenings match
      if (doorsMatch) times.push({ doors: doorsMatch[1] });
      if (filmMatch) times[times.length - 1].films = filmMatch[1];
      if (screeningsMatch) times[times.length - 1].films = screeningsMatch[1];
      if (doorsMatch || filmMatch || screeningsMatch) return;

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

    const bookingUrls = $bookingCol
      .find("a")
      .filter((i, el) => $(el).attr("href").trim() && $(el).text().trim());
    const performances = times.map(
      ({ films: filmTime, doors: doorsTime }, index) => {
        const date = parseDate(`${dateMatch[1]} ${dateMatch[2]}`, filmTime);
        const notesList = [];
        if (doorsTime) notesList.push(`Doors ${doorsTime}`);
        return createPerformance({
          date,
          notesList,
          url: bookingUrls.eq(index).attr("href"),
        });
      },
    );

    if (performances.length === 0) return;

    // If there's no booking URL (usualoly when the performance is sold out),
    // then skip adding this movie and we'll get it from historical data.
    // TODO: Keep an eye on this, we may want to move how we calculate the ID
    // below to somehting else so that we always get fresh data even for sold
    // out movies.
    if (bookingUrls.length === 0) return;

    // Use the event ID of the first performance as the overall movie ID.
    // Normally this wouldn't be a great idea, but each listing is per day, so
    // we should be ok to use this as an overall ID knowing it won't change
    // until the date of all performances added as part of this movie object.
    const [, id] = bookingUrls
      .eq(0)
      .attr("href")
      .match(/event\/id\/(\d+)/);
    const showingId = generateShowingId(attributes, id);

    const movie = {
      showingId,
      title,
      url: `${attributes.domain}/#:~:text=${encodeURIComponent(title)}`,
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
