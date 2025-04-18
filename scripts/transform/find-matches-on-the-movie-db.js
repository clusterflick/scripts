const { format } = require("date-fns");
const {
  parseMinsToMs,
  getMovieTitleAndYearFrom,
} = require("../../common/utils");
const normalizeTitle = require("../../common/normalize-title");
const {
  searchForBestMatch,
  getMovieInfoAndCacheResults,
} = require("../../common/get-movie-data");

async function findMatchesOnTheMovieDb(movies) {
  const processedMovies = [];
  for (const movie of movies) {
    const title = normalizeTitle(movie.title, { retainYear: true });
    const { title: normalizedTitle, year } = getMovieTitleAndYearFrom(title);
    const result = await searchForBestMatch({
      normalizedTitle,
      movie,
      year: year || movie.overview.year,
    });

    // If there's no best match, just move on
    if (!result) {
      processedMovies.push(movie);
      continue;
    }

    if (!movie.overview.duration) {
      try {
        const movieInfo = await getMovieInfoAndCacheResults({ id: result.id });
        if (movieInfo.runtime) {
          movie.overview.duration = parseMinsToMs(movieInfo.runtime);
        }
      } catch {
        // Nothing to be done if the movieBD is having an issue!
        // This can happen if the match has been removed, but is still being
        // returned by the search API - looking up the movie will return 404
      }
    }

    // If the result doesn't have a release date, default it to the date of
    // the first performance.
    const defaultReleaseDate = format(
      new Date(movie.performances[0].time),
      "yyyy-MM-dd",
    );
    processedMovies.push({
      ...movie,
      themoviedb: {
        id: result.id,
        title: result.title,
        releaseDate: result.release_date || defaultReleaseDate,
        summary: result.overview,
      },
    });
  }
  return processedMovies;
}

module.exports = findMatchesOnTheMovieDb;
