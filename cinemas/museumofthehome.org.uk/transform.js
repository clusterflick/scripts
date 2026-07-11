const cheerio = require("cheerio");
const { parse } = require("date-fns");
const {
  generateShowingId,
  createPerformance,
  createOverview,
  createAccessibility,
  createFormat,
  parseTitleAndClassification,
} = require("../../common/utils");
const attributes = require("./attributes");

// The whats-on page embeds the full event listing as JSON in a #json-data tag
const getEvents = (html) => {
  const $ = cheerio.load(html);
  const raw = $("#json-data").text();
  if (!raw) {
    throw new Error(
      "Could not find #json-data - the page structure may have changed",
    );
  }
  return JSON.parse(raw);
};

const isFilm = (event) =>
  Array.isArray(event.type) && event.type.includes("film");

const parseDate = (value) => parse(value, "yyyy-MM-dd HH:mm:ss", new Date());

async function transform(data, sourcedEvents) {
  const events = getEvents(data.movieListPage);

  const movies = events
    .filter(isFilm)
    .filter((event) => !event.cancelled)
    .map((event) => {
      const { title, classification } = parseTitleAndClassification(
        event.title,
      );

      return {
        showingId: generateShowingId(attributes, event.ID),
        title,
        url: event.link,
        overview: createOverview({ classification }),
        performances: [
          createPerformance({
            date: parseDate(event.start_date),
            url: event.link,
            status: { soldOut: !!event.event_sold_out },
            accessibility: createAccessibility(title, {}, event.summary),
            format: createFormat(title, {}, event.summary),
          }),
        ],
        matchingHints: {
          overview: event.summary,
        },
      };
    });

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (sourced) => sourced,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
