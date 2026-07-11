const {
  createOverview,
  createPerformance,
  createAccessibility,
  createFormat,
  generateShowingId,
} = require("../utils");
const { parseDate } = require("./utils");

async function transform(
  attributes,
  { films, screenings, screeningTypes },
  sourcedEvents,
) {
  const { cinemaId, domain } = attributes;
  const movies = Object.values(films).reduce((moviesAtThreate, movie) => {
    const siteMovieScreenings = movie.screenings.byCinema[cinemaId];
    if (!siteMovieScreenings) return moviesAtThreate;

    const overview = createOverview({
      classification: movie.rating,
      directors: movie.director,
    });

    const movieUrl = `${domain}${movie.link}`;
    const show = {
      showingId: generateShowingId(attributes, movie.vistaId),
      title: movie.title,
      url: movieUrl,
      overview,
      performances: [],
      matchingHints: { overview: movie.short_synopsis },
    };

    const screeningIds = Object.values(siteMovieScreenings).flatMap(
      (screeningIds) => screeningIds,
    );
    show.performances = screeningIds.map((screeningId) => {
      const screening = screenings[screeningId];

      const status = {
        soldOut:
          !screening.bookable &&
          screening.message.toLowerCase().includes("sold out"),
      };

      const screeningType = screeningTypes[screening.st]?.title?.toLowerCase();
      const accessibility = {
        subtitled: screeningType === "electric subtitled",
        babyFriendly:
          screeningType === "electric scream!" ||
          screeningType === "electric kids club",
      };

      return createPerformance({
        date: parseDate(`${screening.d}T${screening.t}`),
        screen: screening.sn,
        notesList:
          screeningType !== "main feature"
            ? [screeningTypes[screening.st]?.title]
            : [],
        url: screening.link ? `${domain}${screening.link}` : movieUrl,
        status,
        accessibility: createAccessibility(
          movie.title,
          accessibility,
          movie.short_synopsis,
        ),
        format: createFormat(movie.title, {}, movie.short_synopsis),
      });
    });

    return moviesAtThreate.concat(show);
  }, []);

  if (movies.length === 0) {
    throw new Error("No movies found - the page structure may have changed");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
