const cheerio = require("cheerio");
const {
  generateShowingId,
  createOverview,
  createPerformance,
  getText,
} = require("../../common/utils");
const { parse } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const attributes = require("./attributes");

async function transform({ moviePages }, sourcedEvents) {
  const movies = [];

  for (const [, html] of Object.entries(moviePages)) {
    const $ = cheerio.load(html);
    const canonicalUrl = $('link[rel="canonical"]').attr("href");

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
        }),
      );
    });

    const id = canonicalUrl.replace(`${attributes.domain}/events/`, "");
    const showingId = generateShowingId(attributes, id);

    const movie = {
      showingId,
      title: getText($(".event-hero__title")),
      url: canonicalUrl,
      overview: createOverview({}),
      performances,
      matchingHints: {
        overview: getText($("div.variable-color.mt-sm")),
      },
    };

    movies.push(movie);
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
