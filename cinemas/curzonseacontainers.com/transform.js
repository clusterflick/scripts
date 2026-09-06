const cheerio = require("cheerio");
const slugify = require("slugify");
const attributes = require("./attributes");
const {
  getText,
  createPerformance,
  generateShowingId,
  createOverview,
  createAccessibility,
  createFormat,
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
    const description = getText($(this).find(".film-desc"));

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
            accessibility: createAccessibility(title, {}, description),
            format: createFormat(title, {}, description),
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
      // Veezi gives no year and no crew, so the description is the only thing
      // that separates a new release from an older film of the same name -
      // and without it the LLM review step declines to run at all.
      // The trap is a title TheMovieDB holds several versions of: it reuses
      // one boilerplate synopsis across every adaptation of a novel, which
      // once matched "Wuthering Heights" to the 2022 version. Watch for that
      // rather than for descriptions being absent.
      matchingHints: { overview: description },
    });
  });

  if (movies.length === 0) {
    // When the venue has nothing scheduled, Veezi drops both tab panels and
    // renders an explicit empty state instead. Without that marker, no movies
    // means our parsing of the by-film panel has broken.
    if ($("p.empty").length === 0) {
      throw new Error("No movies found - the page structure may have changed");
    }
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
