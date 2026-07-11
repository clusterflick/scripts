const cheerio = require("cheerio");
const { setHours, setMinutes } = require("date-fns");
const {
  getText,
  createPerformance,
  createOverview,
  createAccessibility,
  createFormat,
  getValidFormat,
  generateShowingId,
  isPrivateHire,
} = require("../../common/utils");
const { calculate24Hours, parseDate } = require("./utils");
const attributes = require("./attributes");

function getLine($, $lines, prefix) {
  let combinedLines = "";
  $lines.find("span").each(function () {
    const line = getText($(this));
    if (!line.startsWith(prefix)) return;
    combinedLines = `${combinedLines}, ${line.replace(prefix, "")}`;
  });
  return combinedLines;
}

function parseMovieProperties($, $movieProperties) {
  const properties = {
    categories: "",
  };
  let isAfterAgeRestriction = false;

  $movieProperties.find("span").each(function () {
    const movieProperty = getText($(this));

    // if it's just 4 digits, it's the year
    const year = movieProperty.match(/^(\d{4})$/);
    if (year) {
      properties.year = year[1];
      return;
    }

    // if it's digits ending in mins it's the duration
    const duration = movieProperty.match(/^(\d+)mins$/);
    if (duration) {
      properties.duration = duration[1];
      return;
    }

    // if it's digits ending in mins it's the duration
    const ageRestriction = movieProperty.match(/^\((\w+)\)$/);
    if (ageRestriction) {
      properties.classification = ageRestriction[1];
      isAfterAgeRestriction = true;
      return;
    }

    if (isAfterAgeRestriction) {
      properties.categories = `${properties.categories}, ${movieProperty}`;
    }
  });

  return properties;
}

async function transform({ movieListPage }, sourcedEvents) {
  const $ = cheerio.load(movieListPage);
  const $entries = $(".jacro-event");

  const movies = [];
  $entries.each(function () {
    const $entry = $(this);

    const $movieDetails = $entry.find(".jacrofilm-list-content");
    const $movieTitle = $movieDetails.find(".liveeventtitle");
    const $moviePeople = $movieDetails.find(".film-info");
    const $movieProperties = $movieDetails.find(".running-time");
    const title = getText($movieTitle);
    const url = $movieTitle.attr("href");
    const id = url.match(/\/film\/([^/]+)\//i)[1];
    const showingId = generateShowingId(attributes, id);

    // Don't pull data for entries which aren't bookable films
    if (isPrivateHire(title)) return;

    const overview = createOverview({
      directors: getLine($, $moviePeople, "Directed by "),
      actors: getLine($, $moviePeople, "Starring "),
      ...parseMovieProperties($, $movieProperties),
    });

    const synopsis = getText($movieDetails.find(".jacro-formatted-text"));

    const performances = [];
    const $performanceDays = $entry.find(".performance-list-items .heading");
    $performanceDays.each(function () {
      const $performanceDay = $(this);
      const date = parseDate(getText($performanceDay));

      let $currentElement = $performanceDay.next();
      while ($currentElement.is("li")) {
        const notesList = [];
        const statusText = getText($currentElement.find(".hover"));
        const status = { soldOut: statusText.toLowerCase() === "sold out" };
        if (
          statusText.toLowerCase() !== "book" &&
          statusText.toLowerCase() !== "sold out"
        ) {
          notesList.push(statusText);
        }

        const tagMapping = {
          "ext. eds": "Extended Edition",
          "£1 mem": "£1 member screening",
          dub: "Dubbed",
        };

        const accessibility = {};
        const format = {};
        $currentElement.find(".movietag .tag").each(function () {
          const tag = getText($(this));
          if (tag.toLowerCase() === "hoh" || tag.toLowerCase() === "sdh") {
            accessibility.hardOfHearing = true;
            return; // this doesn't need added to the notes
          }
          if (tag.toLowerCase() === "sub") {
            accessibility.subtitled = true;
            return; // this doesn't need added to the notes
          }
          if (tag.toLowerCase() === "digital") {
            // "For our digital screenings, there’s a 95% chance we have an
            // audio description track that can be transmitted for the
            // performance." - https://princecharlescinema.com/accessibility/
            accessibility.audioDescription = true;
          }

          // Format tags (35mm, 70mm, ...) become structured format, not notes.
          const tagFormat = getValidFormat(tag);
          if (Object.keys(tagFormat).length > 0) {
            Object.assign(format, tagFormat);
            return;
          }

          notesList.push(tagMapping[tag.toLowerCase()] || tag);
        });

        const [, hours, minutes, suffix] = getText(
          $currentElement.find(".time"),
        ).match(/^(\d+):(\d{2})\W+(\w{2})/i);

        const performanceTime = setHours(
          setMinutes(date, parseInt(minutes, 10)),
          calculate24Hours(hours, suffix),
        );

        const bookingUrl = $currentElement.find("a").attr("href");

        performances.push(
          createPerformance({
            date: performanceTime,
            notesList,
            url: bookingUrl || url,
            status,
            accessibility: createAccessibility(title, accessibility, synopsis),
            format: createFormat(title, format, synopsis),
          }),
        );
        $currentElement = $currentElement.next();
      }
    });

    movies.push({
      showingId,
      title,
      url,
      overview,
      performances,
      matchingHints: { overview: synopsis },
    });
  });

  if (movies.length === 0) {
    throw new Error("No movies found - the page structure may have changed");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
