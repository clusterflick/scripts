const categorise = require("../../common/categorise");
const { runLlmFunction } = require("../../common/utils");

async function categoriseEntries(movies) {
  const processedMovies = [];
  for (const movie of movies) {
    const categorisedMovie = await runLlmFunction(() => categorise(movie));
    processedMovies.push(
      categorisedMovie !== null
        ? categorisedMovie
        : { ...movie, category: "event" },
    );
  }
  return processedMovies;
}

module.exports = categoriseEntries;
