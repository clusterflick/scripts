const cheerio = require("cheerio");
const {
  generateShowingId,
  convertToList,
  getText,
  createOverview,
  createPerformance,
  getValidClassification,
  createAccessibility,
} = require("../../common/utils");
const attributes = require("./attributes");
const { parseISO } = require("date-fns");

const directorMatch = /(^|\s)dirs?\.\s+/i;
const durationMatch = /\s+min(ute)?s?\.?/i;
const yearMatch = /(^|\s)\d{4}($|,)/i;
const classificationMatch = /\s+\(([^)]+)\)$/i;

const getClassification = (colophonSource, detailsSource, titleSource) => {
  const validClassifications = [
    colophonSource,
    detailsSource,
    titleSource,
  ].filter((value) => getValidClassification(value));
  if (validClassifications.length > 0) {
    return getValidClassification(validClassifications[0]);
  }
  return undefined;
};

const getOverview = (fullColophon, details, trailer, title) => {
  const colophon = convertToList(fullColophon);
  const director = colophon.find((val) => val.match(directorMatch));
  const colophonDuration = colophon.find((val) => val.match(durationMatch));
  const classification = colophon.find((val) => val.match(classificationMatch));
  const rawDuration = details.duration || colophonDuration;

  return createOverview({
    duration: rawDuration?.replace(durationMatch, ""),
    year: colophon.find((val) => val.match(yearMatch)),
    directors: director?.replace(directorMatch, ""),
    classification: getClassification(
      classification?.match(classificationMatch)?.[1],
      details.age?.replace(/\s+/g, ""),
      title.match(classificationMatch)?.[1],
    ),
    trailer,
  });
};

async function transform({ movieListPage, moviePages }, sourcedEvents) {
  const movies = [];

  for (const movie of movieListPage) {
    // Ignore entries which aren't actually movies
    if (!movie.moviePageUrl) continue;

    const moviePage = moviePages[movie.moviePageUrl];
    const $ = cheerio.load(moviePage);

    const trailer = $(".video-embed-field-provider-youtube iframe").attr("src");
    let $colophon = Array.from($(".c-wysiwyg").first().children()).find(
      (el) => {
        const value = getText($(el));
        return (
          value.match(directorMatch) &&
          value.match(durationMatch) &&
          value.match(yearMatch)
        );
      },
    );

    const details = {};
    Array.from($(".c-info-block--primary ul .o-label")).forEach((el) => {
      const key = getText($(el)).toLowerCase().replace(":", "");
      const parent = $(el).parent();
      $(el).remove();
      const value = getText(parent);
      details[key] = value;
    });

    movies.push({
      showingId: generateShowingId(attributes, movie.productionSeasonId),
      title: movie.productionTitle,
      url: movie.moviePageUrl,
      overview: getOverview(
        getText($($colophon)),
        details,
        trailer,
        movie.productionTitle,
      ),
      performances: movie.performances.map(
        ({
          iso8601DateString,
          actionUrl,
          performanceStatusMessage,
          hasLimitedSeatingAvailable,
        }) => {
          return createPerformance({
            date: parseISO(iso8601DateString),
            notesList: hasLimitedSeatingAvailable
              ? ["Limited seating available"]
              : [],
            url: actionUrl,
            screen: details.location.split(",")[0]?.trim(),
            status: {
              soldOut: performanceStatusMessage.toLowerCase() === "sold out",
            },
            accessibility: createAccessibility(movie.productionTitle, {}),
          });
        },
      ),
      matchingHints: {
        overview: Array.from($(".c-wysiwyg").first().children())
          .map((el) => getText($(el)))
          .join("\n")
          .split("\n")
          .map((value) => value.trim())
          .filter((value) => !!value)
          .join("\n"),
      },
    });
  }

  if (movies.length === 0) {
    throw new Error("No movies found - the page structure may have changed");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
