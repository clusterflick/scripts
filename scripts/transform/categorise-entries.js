const askLlmToCategorise = require("../../common/ask-llm-to-categorise");
const { runLlmFunction } = require("../../common/utils");

async function categoriseEntries(movies) {
  const processedMovies = [];
  for (const movie of movies) {
    const categorisedMovie = await runLlmFunction(() =>
      askLlmToCategorise(movie),
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
