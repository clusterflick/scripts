const cheerio = require("cheerio");
const slugify = require("slugify");
const {
  getText,
  createOverview,
  createPerformance,
  createAccessibility,
} = require("../utils");
const { parseDate } = require("./utils");

function getAdditionalDataFor(data) {
  const $ = cheerio.load(data);

  const addiitionalData = {};

  $(".directorDiv .directorInner").each(function () {
    const key = getText($(this)).toLowerCase().replace(":", "").trim();

    if (key === "director") {
      addiitionalData.directors = getText($(this).next());
    }
    if (key === "starring") {
      addiitionalData.actors = getText($(this).next());
    }
  });

  return addiitionalData;
}

async function transform(
  { domain, cinemaId },
  { movieListPage: { movies: moviesData }, moviePages },
  sourcedEvents,
) {
  const movies = moviesData.reduce((moviesAtCinema, movie) => {
    const slug = slugify(movie.Title);
    const showings = movie.show_times.filter(
      (showing) => showing.CinemaId === cinemaId,
    );

    if (showings.length === 0) return moviesAtCinema;

    // Remove private hire entries
    if (movie.Title.toLowerCase().startsWith("private hire (")) {
      return moviesAtCinema;
    }

    const overview = createOverview({
      duration: movie.RunTime,
      classification: movie.Rating,
      trailer: movie.TrailerUrl,
      ...getAdditionalDataFor(moviePages[movie.ScheduledFilmId]),
    });

    const transformedMovie = {
      title: movie.Title,
      url: `${domain}/movie-details/${cinemaId}/${movie.ScheduledFilmId}/${slug}`,
      overview,
      performances: showings.map((showing) => {
        const hasAttribute = (value) =>
          !!(showing.attributes || []).find(
            ({ attribute }) => attribute.toLowerCase() === value,
          );

        const status = {
          soldOut: !!showing.SoldoutStatus,
        };

        const accessibility = createAccessibility({
          audioDescription: hasAttribute("audio d"),
          relaxed: hasAttribute("relaxed"),
          babyFriendly:
            hasAttribute("watch baby") ||
            hasAttribute("toddler ti") ||
            hasAttribute("kids' club"),
          hardOfHearing: hasAttribute("hohsub"),
          subtitled: hasAttribute("sub cinema"),
        });

        return createPerformance({
          date: parseDate(showing.Showtime),
          screen: showing.ScreenName,
          notesList: (showing.attributes || [])
            .filter(
              ({ attribute }) =>
                !["audio d", "relaxed", "hohsub", "sub cinema"].includes(
                  attribute.toLowerCase(),
                ),
            )
            .map(({ attribute_full: title, description }) =>
              description ? `${title}: ${description}` : title,
            ),
          url: `https://ticketing.picturehouses.com/Ticketing/visSelectTickets.aspx?cinemacode=${cinemaId}&txtSessionId=${showing.SessionId}&visLang=1`,
          status,
          accessibility,
        });
      }),
    };

    return moviesAtCinema.concat(transformedMovie);
  }, []);

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
