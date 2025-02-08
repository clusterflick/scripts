const { parseISO } = require("date-fns");
const {
  createOverview,
  createPerformance,
  createAccessibility,
} = require("../../common/utils");

async function transform(
  { domain, cinemaId },
  { movieListPage, moviePages: { movieData, attributeData } },
  sourcedEvents,
) {
  const movies = movieData.reduce((moviesAtThreate, movie) => {
    const isShowing = !!movie.theaters.find(({ th }) => th === cinemaId);
    if (!isShowing) return moviesAtThreate;

    if (!movieListPage[movie.id]) return moviesAtThreate;

    const overview = createOverview({
      duration: movie.runtime ? movie.runtime / 60 : undefined,
      categories: movie.genres,
      actors: movie.casting,
      directors: movie.direction.concat(movie.coDirection),
      classification: movie.certificate,
      trailer: movie.trailer.youtube?.[0],
    });

    const performances = Object.values(movieListPage[movie.id])
      .flatMap((dayPerformances) => dayPerformances)
      .map((performance) => {
        let accessibility = {};
        let notesList = [];

        if (performance.occupancy.rate !== 100) {
          notesList.push(`${performance.occupancy.rate}% of seats sold`);
        }
        performance.tags.forEach((tag) => {
          if (tag === "Format.Projection.Digital") return;

          const tagId = `${cinemaId}_${tag}`;
          const tagData = attributeData.find(({ id }) => id === tagId);
          if (!tagData) return;

          if (tag.toLowerCase() === "showtime.accessibility.subtitled") {
            accessibility.subtitled = true;
            return;
          }
          if (
            tag.toLowerCase() === "showtime.restriction.babyclub" ||
            tag.toLowerCase() === "showtime.restriction.kidsfriendly"
          ) {
            accessibility.babyFriendly = true;
            return;
          }

          // Any tags which aren't accessibility related can be added to notes
          notesList = notesList.concat(tagData.localizations[0].description);
        });

        return createPerformance({
          date: parseISO(performance.startsAt),
          notesList,
          url: performance.data.ticketing[0].urls[0],
          status: { soldOut: performance.occupancy.rate === 100 },
          accessibility: createAccessibility(accessibility),
        });
      });

    return moviesAtThreate.concat({
      title: movie.title,
      url: `${domain}${movie.path}`,
      overview,
      performances,
    });
  }, []);

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );

  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
