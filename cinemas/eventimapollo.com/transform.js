const cheerio = require("cheerio");
const {
  generateShowingId,
  createOverview,
  createPerformance,
  getText,
  createAccessibility,
  createFormat,
} = require("../../common/utils");
const { parse } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const attributes = require("./attributes");

async function transform({ moviePages }, sourcedEvents) {
  const movies = [];

  for (const [, html] of Object.entries(moviePages)) {
    const $ = cheerio.load(html);
    const canonicalUrl = $('link[rel="canonical"]').attr("href");
    const title = getText($(".event-hero__title"));
    const overview = getText($("div.variable-color.mt-sm"));

    const performances = [];
    $(".showings__table-row").each((_, element) => {
      const $row = $(element);
      const dateText = getText($row.find("div").eq(0));
      const time = getText($row.find(".showing__doors"));
      const date = parse(
        `${dateText} ${time}`,
        "MMMM do yyyy HH:mm",
        new Date(),
        { locale: enGB },
      );
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid date parsed: ${dateText} ${time}`);
      }

      const showtimeType = getText($row.find("div").eq(1));
      performances.push(
        createPerformance({
          date,
          url: canonicalUrl,
          notesList: showtimeType ? [showtimeType] : [],
          accessibility: createAccessibility(title, {}, overview),
          format: createFormat(title, {}, overview),
        }),
      );
    });

    const id = canonicalUrl.replace(`${attributes.domain}/events/`, "");
    const showingId = generateShowingId(attributes, id);

    const movie = {
      showingId,
      title,
      url: canonicalUrl,
      overview: createOverview({}),
      performances,
      matchingHints: { overview },
    };

    movies.push(movie);
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
