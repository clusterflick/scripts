const categorise = require("../../common/categorise");
const { runLlmFunction } = require("../../common/utils");

// Yesterday's category for each listing, for categorise() to break a near-tie
// with. Only listings that were not matched to a film are carried: a matched
// listing is "movie" because it matched, not because the categoriser chose it,
// so its category says nothing about what the categoriser would pick. The
// later shorts and multiple-movies stages add themoviedbs but never change the
// category, so for everything else yesterday's value is the categoriser's own.
//
// Taken from the whole of yesterday's release, including venues opted out of
// recovery: those are opted out because a removed listing's URL cannot be
// checked, which does not matter when looking a category up by showingId.
const previousCategoriesFrom = (previousRelease = []) =>
  new Map(
    previousRelease
      .filter((movie) => !movie.themoviedb)
      .map((movie) => [movie.showingId, movie.category]),
  );

async function categoriseEntries(movies, previousRelease = []) {
  const previousCategories = previousCategoriesFrom(previousRelease);
  const processedMovies = [];
  for (const movie of movies) {
    const categorisedMovie = await runLlmFunction(() =>
      categorise(movie, {
        previousCategory: previousCategories.get(movie.showingId),
      }),
    );
    processedMovies.push(
      categorisedMovie !== null
        ? categorisedMovie
        : { ...movie, category: "event" },
    );
  }
  return processedMovies;
}

module.exports = categoriseEntries;
module.exports.previousCategoriesFrom = previousCategoriesFrom;
