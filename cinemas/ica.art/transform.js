const cheerio = require("cheerio");
const {
  generateShowingId,
  convertToList,
  getText,
  createOverview,
  createPerformance,
  createAccessibility,
  createFormat,
  basicNormalize,
} = require("../../common/utils");
const attributes = require("./attributes");
const { parseDate } = require("./utils");

const getOverview = (colophon, trailer) => {
  const correctedColophon = colophon
    // Fix missing comma before film country
    .replace(/([^,])\s+Japan\s+/i, "$1, Japan ");
  const details = convertToList(correctedColophon);
  const directorMatch = /^dirs?\.\s+/i;
  const director = details.find((value) =>
    value.toLowerCase().match(directorMatch),
  );
  const durationMatch = /\s+mins?\.?$/i;
  const duration = details.find((value) =>
    value.toLowerCase().match(durationMatch),
  );
  const yearMatch = /\s+\d{4}$/i;
  const countryYear = details.find((value) =>
    value.toLowerCase().match(yearMatch),
  );

  return createOverview({
    year: countryYear ? countryYear.split(" ").at(-1) : undefined,
    duration: duration?.replace(durationMatch, ""),
    directors: director?.replace(directorMatch, ""),
    trailer,
  });
};

async function transform({ moviePages }, sourcedEvents) {
  const movies = [];

  for (const moviePageUrl in moviePages) {
    const moviePage = moviePages[moviePageUrl];
    const $ = cheerio.load(moviePage);

    const title = Array.from($("a span.title").contents())
      .map((el) => getText($(el)))
      .join(" ")
      .trim()
      .replace(/\s+/g, " ");
    const details = getText($("#colophon"));
    const id = moviePageUrl.replace(`${attributes.domain}/films/`, "");
    const trailer = $("#films-trailer iframe").attr("src");
    const bookingUrl = $("#detail-body .row.select")
      .attr("onclick")
      .replace('location.href="', "")
      .replace('";', "");
    const seasons = Array.from($(".season-item"))
      .map((el) => getText($(el)))
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    const overview = Array.from(
      $("#detail-body")
        .children()
        .not(".subhead")
        .not("#films-image")
        .not("#films-trailer")
        .not("#trailer-control")
        .not("#colophon")
        .not("#credit")
        .not(".season-item")
        .not(".row.select"),
    )
      .map((el) => {
        $(el).find("br").replaceWith("\n");
        return getText($(el));
      })
      .filter((value) => value.trim().length > 0)
      .join("\n")
      .replace(/[\n]+/g, "\n")
      .trim();

    movies.push({
      showingId: generateShowingId(attributes, id),
      title,
      url: moviePageUrl,
      overview: getOverview(details, trailer),
      performances: Array.from($(".performance-list .performance"))
        .map((el) => {
          const screen = getText($(el).find(".venue"));
          const date = getText($(el).find(".date"));
          const time = getText($(el).find(".time"));
          const url = bookingUrl.match(/^https?:\/\//i)
            ? bookingUrl
            : `${attributes.domain}${bookingUrl}`;
          return { screen, dateTime: `${date} ${time}`, url };
        })
        .reduce((uniquePerformances, p) => {
          const existingPerformance = uniquePerformances.find(
            ({ screen, dateTime, url }) =>
              screen === p.screen && dateTime === p.dateTime && url === p.url,
          );
          if (!existingPerformance) uniquePerformances.push(p);
          return uniquePerformances;
        }, [])
        .map(({ screen, dateTime, url }) => {
          return createPerformance({
            date: parseDate(dateTime),
            notesList: seasons.map((season) => `Part of ${season}`),
            url,
            screen,
            accessibility: createAccessibility(
              title,
              {
                subtitled: basicNormalize(details).includes(
                  "with english subtitles",
                ),
              },
              overview,
            ),
            format: createFormat(title, {}, overview),
          });
        }),
      matchingHints: { overview },
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
