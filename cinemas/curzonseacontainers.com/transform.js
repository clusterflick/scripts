const cheerio = require("cheerio");
const slugify = require("slugify");
const attributes = require("./attributes");
const {
  getText,
  createPerformance,
  generateShowingId,
  createOverview,
  createAccessibility,
  basicNormalize,
} = require("../../common/utils");
const { parseDate } = require("./utils");

async function transform({ movieListPage }, sourcedEvents) {
  const $ = cheerio.load(movieListPage);
  const movies = [];
  $("#sessionsByFilmConent .film").each(function () {
    const title = getText($(this).find(".title"));
    // Use the title slug rather than the Veezi event code from the poster
    // image, because Veezi IDs rotate when Curzon creates new sessions.
    const showingId = generateShowingId(
      attributes,
      slugify(basicNormalize(title), { strict: true }),
    );
    const overview = createOverview({
      classification: getText($(this).find(".censor")),
    });

    const performances = [];
    const $dateContainer = $(this).find(".date-container");
    $dateContainer.each(function () {
      const day = getText($(this).find(".date"));
      const $performanceLink = $(this).find(".session-times li a");
      $performanceLink.each(function () {
        const time = getText($(this).find("time"));
        performances.push(
          createPerformance({
            date: parseDate(`${day} @ ${time}`),
            url: `https://ticketing.eu.veezi.com${$(this).attr("href")}`,
            accessibility: createAccessibility(title, {}),
          }),
        );
      });
    });

    movies.push({
      showingId,
      title,
      url: `${attributes.url}#:~:text=${encodeURIComponent(title)}`,
      overview,
      performances,
      // TODO: Remove matching hints. For some reason Curzon Sea Containers
      // has used the same description as a different version of the movie for
      // "Wuthering Heights", so it's matching the 2022 version.
      // matchingHints: { overview: getText($(this).find(".film-desc")) },
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
