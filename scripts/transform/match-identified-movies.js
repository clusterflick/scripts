const { format } = require("date-fns");
const { searchForBestMatch } = require("../../common/get-movie-data");
const normalizeTitle = require("../../common/normalize-title");
const {
  runLlmFunction,
  createOverview,
  convertNamesTextToList,
} = require("../../common/utils");

async function matchIdentifiedMovies(movie, identifyFn) {
  const identification = await runLlmFunction(() => identifyFn(movie));

  if (!identification || identification.movies.length === 0) {
    return [];
  }

  // Filter to only high-confidence identifications
  const highConfidenceMovies = identification.movies.filter(
    (m) => m.confidence >= 7,
  );

  if (highConfidenceMovies.length === 0) {
    return [];
  }

  // Try to match each identified movie against TMDB
  const matches = [];
  for (const identifiedMovie of highConfidenceMovies) {
    // Create a minimal movie object for searchForBestMatch
    const searchMovie = {
      title: identifiedMovie.title,
      overview: createOverview({}),
      performances: movie.performances,
      matchingHints: {
        ...movie.matchingHints,
        crew: identifiedMovie.director
          ? convertNamesTextToList(identifiedMovie.director)
          : movie.matchingHints?.crew,
      },
    };

    const normalizedTitle = normalizeTitle(identifiedMovie.title, {
      retainYear: false,
    });

    try {
      const result = await searchForBestMatch({
        normalizedTitle,
        movie: searchMovie,
        year: identifiedMovie.year,
      });

      if (result) {
        // Default release date to first performance if not available
        const defaultReleaseDate = format(
          new Date(movie.performances[0].time),
          "yyyy-MM-dd",
        );

        matches.push({
          id: result.id,
          title: result.title,
          releaseDate: result.release_date || defaultReleaseDate,
          summary: result.overview || "",
        });
      }
    } catch {
      // Silently continue with other movies on error
    }
  }

  // Deduplicate by TMDB id in case similar titles resolved to the same entry
  const seen = new Set();
  return matches.filter((match) => {
    if (seen.has(match.id)) return false;
    seen.add(match.id);
    return true;
  });
}

module.exports = matchIdentifiedMovies;
