const { parseISO } = require("date-fns");
const {
  createOverview,
  createPerformance,
  createAccessibility,
  createFormat,
  getValidFormat,
  generateShowingId,
} = require("../../common/utils");

// Performances which are announced but not yet on sale come back with an empty
// `ticketing` array, so fall back to the film page where they can be booked
// once they open. A missing `ticketing` key is a structure change, not a
// not-on-sale performance, so let that throw.
const getUrl = (data, moviePageUrl) =>
  data.ticketing[0]?.urls[0] ?? moviePageUrl;

async function transform(
  attributes,
  { movieListPage, moviePages: { movieData, movieDetails, attributeData } },
  sourcedEvents,
) {
  const { domain, cinemaId } = attributes;
  const movies = movieData.reduce((moviesAtThreate, movie) => {
    const isShowing = !!movie.theaters.find(({ th }) => th === cinemaId);
    if (!isShowing) return moviesAtThreate;

    if (!movieListPage[movie.id]) return moviesAtThreate;

    const moviePageUrl = `${domain}${movie.path}`;
    const movieInfo = movieDetails.find(({ id }) => id === movie.id) || {};
    const overview = createOverview({
      duration: movieInfo.runtime ? movieInfo.runtime / 60 : undefined,
      categories: movieInfo.genres,
      actors: movieInfo.casting,
      directors: (movieInfo.direction || []).concat(
        movieInfo.coDirection || [],
      ),
      classification: movieInfo.certificate,
      trailer: movie.trailer.youtube?.[0],
    });

    const performances = Object.values(movieListPage[movie.id])
      .flatMap((dayPerformances) => dayPerformances)
      .filter((performance, index, all) => {
        // The Everyman API occasionally returns duplicate performance entries.
        // Deduplicate by startsAt + booking URL to avoid schema validation failures.
        const matchingIndex = all.findIndex(
          ({ startsAt, data }) =>
            startsAt === performance.startsAt &&
            getUrl(data, moviePageUrl) ===
              getUrl(performance.data, moviePageUrl),
        );
        return index === matchingIndex;
      })
      .map((performance) => {
        let accessibility = {};
        let format = {};
        let notesList = [];

        performance.tags.forEach((tag) => {
          if (tag === "Format.Projection.Digital") return;

          const tagId = `${cinemaId}_${tag}`;
          const tagData = attributeData.find(({ id }) => id === tagId);
          if (!tagData) return;

          if (tag.toLowerCase() === "showtime.accessibility.subtitled") {
            accessibility.subtitled = true;
            return;
          }
          if (tag.toLowerCase() === "showtime.accessibility.closedcaption") {
            accessibility.hardOfHearing = true;
            return;
          }
          if (
            tag.toLowerCase() === "showtime.restriction.babyclub" ||
            tag.toLowerCase() === "showtime.restriction.kidsfriendly"
          ) {
            accessibility.babyFriendly = true;
            return;
          }

          // Format.Projection.35mm / .70mm etc. - capture the leaf as structured
          // format rather than leaving it in notes (Digital is skipped above).
          const tagFormat = getValidFormat(tag.split(".").pop());
          if (Object.keys(tagFormat).length > 0) {
            format = { ...format, ...tagFormat };
            return;
          }

          // Any tags which aren't accessibility related can be added to notes
          notesList = notesList.concat(tagData.localizations[0].description);
        });

        return createPerformance({
          date: parseISO(performance.startsAt),
          notesList,
          url: getUrl(performance.data, moviePageUrl),
          status: { soldOut: performance.occupancy.rate === 100 },
          accessibility: createAccessibility(
            movie.title,
            accessibility,
            movie.synopsis,
          ),
          format: createFormat(movie.title, format, movie.synopsis),
        });
      });

    return moviesAtThreate.concat({
      showingId: generateShowingId(attributes, movie.id),
      title: movie.title,
      url: moviePageUrl,
      overview,
      performances,
      matchingHints: { overview: movie.synopsis },
    });
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
