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
    //
    // The identified director goes in the overview, not just the hints. A hint
    // is a name scraped out of a synopsis and may be garbage, so getBestMatch
    // only consults hints once a search has left it more than one candidate -
    // where a single same-titled result comes back it takes it on the title
    // alone. That is the case an identified film is nearly always in: the short
    // itself isn't on TheMovieDB, one unrelated film normalizes to the same
    // title, and it gets matched to that. This director came from the
    // programme's own "Poppy by Julia Schönstädt, 17 mins" billing rather than
    // from name extraction, so it's the same class of data as a venue's own
    // director field and belongs where that is checked.
    const searchMovie = {
      title: identifiedMovie.title,
      overview: createOverview({ directors: identifiedMovie.director ?? "" }),
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
      // This director is the programme's own billing, so a same-titled film
      // made by someone else is ruled out before any reviewer can pick it -
      // otherwise a festival short that isn't on TheMovieDB gets matched to an
      // unrelated film of the same name. Not done for a venue's own director
      // field, which is wrong often enough to rule out the right film.
      const result = await searchForBestMatch({
        normalizedTitle,
        movie: searchMovie,
        year: identifiedMovie.year,
        ruleOutContradictedDirectors: true,
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
