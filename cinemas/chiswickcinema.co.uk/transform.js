const cheerio = require("cheerio");
const {
  createOverview,
  getText,
  sanitizeRichText,
  createPerformance,
  createAccessibility,
  basicNormalize,
  generateShowingId,
} = require("../../common/utils");
const { parseDate } = require("./utils");
const attributes = require("./attributes");

async function transform({ movieListPage, moviePages }, sourcedEvents) {
  const movies = {};

  for (const { films, day } of movieListPage.screenings) {
    for (const { title: rawTitle, url, rating, screenings } of films) {
      // If this is the first time we're seeing this file in the results, create
      // the data for it from the listing before adding performances.
      if (!movies[url]) {
        const $ = cheerio.load(moviePages[url]);
        const filmId = screenings[0]?.[1];
        const showingId = generateShowingId(attributes, filmId);
        const title = sanitizeRichText(rawTitle);
        const overview = createOverview({
          duration: getText($(".film-details__running-time__content"))
            .replace(/minutes/i, "")
            .trim(),
          directors: getText($(".film-details__director__list")),
          actors: getText($(".film-details__cast__list")),
          classification: rating,
          trailer: $("a[data-action='play-trailer']").attr("href"),
        });
        movies[url] = { showingId, title, url, overview, performances: [] };
      }

      for (const screening of screenings) {
        // prettier-ignore
        const [
          time,
          /* filmId */,
          /* unknown */,
          /* unknown */,
          performanceId,
          tags,
        ] = screening;

        movies[url].performances.push(
          createPerformance({
            date: parseDate(`${day} ${time}`),
            notesList: tags.filter(
              (tag) =>
                basicNormalize(tag) !== "subtitled" &&
                basicNormalize(tag) !== "parent & baby",
            ),
            url: `${attributes.domain}/tickets/${performanceId}`,
            accessibility: createAccessibility({
              subtitled: tags.includes("Subtitled"),
              babyFriendly: tags.includes("Parent & Baby"),
            }),
          }),
        );
      }
    }
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return Object.values(movies).concat(listOfSourcedEvents);
}

module.exports = transform;
