const cheerio = require("cheerio");
const attributes = require("./attributes");
const {
  getText,
  createPerformance,
  generateShowingId,
  createOverview,
  createAccessibility,
} = require("../../common/utils");
const { parseDate } = require("./utils");

async function transform({ movieListPage }, sourcedEvents) {
  const $ = cheerio.load(movieListPage);
  const movies = [];
  $("#sessionsByFilmConent .film").each(function () {
    const eventId = new URLSearchParams(
      $(this).find(".poster").attr("src").split("?")[1],
    ).get("code");
    const showingId = generateShowingId(attributes, eventId);
    const title = getText($(this).find(".title"));
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
