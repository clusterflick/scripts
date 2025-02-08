const cheerio = require("cheerio");
const {
  getText,
  createOverview,
  createPerformance,
} = require("../../common/utils");
const { parseDate } = require("./utils");
const { domain } = require("./attributes");

async function transform({ movieListPage, moviePages }, sourcedEvents) {
  const movies = movieListPage.reduce((moviesWithPerformances, movie) => {
    const performances = Object.values(movie.spektrix_data.instances).flatMap(
      (value) => value,
    );

    if (performances.length === 0) return moviesWithPerformances;

    const $ = cheerio.load(moviePages[movie.id]);

    const $director = $(".crew .director");
    $director.children().each(function () {
      $(this).remove();
    });

    let directors = getText($director);
    if (!directors) {
      const directsMatch = getText($(".article-body")).match(
        /\s+(\w+\s+\w+)\s+\([^)]+\)\s+directs\s+/i,
      );
      if (directsMatch) directors = directsMatch[1];
    }

    const $cast = $(".crew .cast");
    $cast.children().each(function () {
      $(this).remove();
    });

    return moviesWithPerformances.concat({
      title: movie.post_title,
      url: `${domain}/cinema/${movie.slug}/`,
      overview: createOverview({
        duration: movie.spektrix_data.duration,
        classification: movie.spektrix_data.rating,
        directors,
        actors: getText($cast),
      }),
      performances: performances.map(
        ({ start, status: { available, capacity, name }, iframeId }) => {
          const notesList = [`${available} of ${capacity} seats remaining`];

          const status = {
            soldOut: $(
              `#dates-and-times a[href="/book-online/${iframeId}"]`,
            ).hasClass("sold-out"),
          };

          return createPerformance({
            date: parseDate(start),
            notesList,
            url: `${domain}/book-online/${iframeId}`,
            screen: name,
            status,
          });
        },
      ),
    });
  }, []);

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
