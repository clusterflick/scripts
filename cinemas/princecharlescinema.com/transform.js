const cheerio = require("cheerio");
const { setHours, setMinutes } = require("date-fns");
const {
  getText,
  createPerformance,
  createOverview,
  createAccessibility,
} = require("../../common/utils");
const { calculate24Hours, parseDate } = require("./utils");

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

    // Don't pull data for entries which aren't bookable films
    if (title.toLowerCase().includes("(do not book)")) {
      return;
    }

    const overview = createOverview({
      directors: getLine($, $moviePeople, "Directed by "),
      actors: getLine($, $moviePeople, "Starring "),
      ...parseMovieProperties($, $movieProperties),
    });

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
            accessibility.audioDescription = true;
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
            accessibility: createAccessibility(accessibility),
          }),
        );
        $currentElement = $currentElement.next();
      }
    });

    movies.push({ title, url, overview, performances });
  });

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
