const { MovieDb } = require("moviedb-promise");
const diff = require("fast-diff");
const slugify = require("slugify");
const normalizeTitle = require("./normalize-title");
const normalizeName = require("./normalize-name");
const { basicNormalize } = require("./utils");
const { dailyCache } = require("./cache");
const askLlm = require("./ask-llm");
require("dotenv").config();

const moviedb = new MovieDb(process.env.MOVIEDB_API_KEY);

const comparableChunk = (value) => value.replace(/\s+/g, "").slice(0, 200);

const compareAsSimilar = (firstString, secondString) => {
  if (firstString === secondString) return true;

  // Compare strings, calculating a score based on the number of characters that
  // have changed. The following counts the number of characters changed
  // (additions and deletions).
  const lettersChanges = diff(firstString, secondString).reduce(
    (count, [score, letters]) => (score === 0 ? count : count + letters.length),
    0,
  );
  // The threshold of 4 below allows for 2 characters to mismatch (a character
  // deleted and then another added), or a difference of 4 characters in length.
  return lettersChanges <= 4;
};

const updateMovie = (movie, update) => {
  return {
    ...movie,
    ...update,
    overview: {
      ...movie.overview,
      ...update.overview,
    },
  };
};

const matchesExpectedCastCrew = async (match, movie) => {
  let movieInfo;
  try {
    movieInfo = await getMovieInfoAndCacheResults(match);
  } catch {
    // Nothing to be done if the movieBD is having an issue!
    // This can happen if the match has been removed, but is still being
    // returned by the search API - looking up the movie will return 404
    return false;
  }

  const crewCredits = movieInfo.credits?.crew || [];
  const crew = crewCredits.flatMap(({ name }) => [
    normalizeName(name),
    normalizeName(name.split(" ").reverse().join(" ")),
  ]);

  // Only attepmpt to match if there's crew information to check against
  if (crew.length > 0) {
    const directors = movie.overview.directors.map((name) =>
      normalizeName(name),
    );

    // Don't bother checking the Opera listings, they're usualy wrong
    if (
      directors.length &&
      basicNormalize(directors[0]) === "themetropolitanopera"
    ) {
      return true;
    }

    const directorMatches = crew.filter((member) =>
      directors.some((director) => compareAsSimilar(director, member)),
    );
    if (directorMatches.length > 0) return true;
  }

  const castCredits = movieInfo.credits?.cast || [];
  const cast = castCredits.flatMap(({ name }) => [
    normalizeName(name),
    normalizeName(name.split(" ").reverse().join(" ")),
  ]);

  // Only attepmpt to match if there's cast information to check against
  if (cast.length > 0) {
    const actors = movie.overview.actors.map((name) => normalizeName(name));

    const actorMatches = cast.filter((member) =>
      actors.some((actor) => compareAsSimilar(actor, member)),
    );
    if (actorMatches.length > 0) return true;

    // Sometimes cinemas will mistakenly put the director in as cast. If we
    // haven't found a match yet, let's try checking the crew against the
    // actors list to see if we find a match.
    const directorMatches = crew.filter((member) =>
      actors.some((actor) => compareAsSimilar(actor, member)),
    );
    if (directorMatches.length > 0) return true;
  }

  return false;
};

async function findMovieByDirector(normalizedTitle, movie) {
  if (movie.overview.directors.length === 0) return;
  const directorsName = movie.overview.directors[0];
  const peopleMatches = await searchPersonAndCacheResults(
    `moviedb-search-person-${slugify(basicNormalize(directorsName))}`,
    directorsName,
  );

  // Start off with all results. If we've only 1 result, we'll pass through the
  // filters below and get returned.
  let directors = peopleMatches.results.sort(
    (a, b) => b.popularity - a.popularity,
  );

  // If the name matches lots of people, let's filter them down by just those
  // known for directing
  if (peopleMatches.results.length > 1) {
    directors = peopleMatches.results.filter(
      ({ known_for_department: department }) =>
        department && basicNormalize(department) === "directing",
    );
  }

  // If we can't find someone known for directing, let's take a punt in
  // production, in case they're branching out
  if (directors.length === 0) {
    directors = peopleMatches.results.filter(
      ({ known_for_department: department }) =>
        department && basicNormalize(department) === "production",
    );
  }

  if (directors.length === 0) return;

  // Limit queries to just 3 matches
  for (const director of directors.slice(0, 3)) {
    // Get the full list of movie credits for the director, filter down to just
    // their directing credits, and match against those
    const credits = await getPersonMovieCreditsAndCacheResults(director.id);
    const directorCredits = credits.crew.filter(
      ({ job }) => job && basicNormalize(job) === "director",
    );
    const resultsWithSameTitle = directorCredits.filter(
      matchesMovieTitle(normalizedTitle),
    );
    if (resultsWithSameTitle.length === 1) return resultsWithSameTitle[0];
  }
}

const hasCrewFor = (movie) =>
  movie.overview.directors.length > 0 || movie.overview.actors.length > 0;

const matchesMovieTitle =
  (normalizedTitle) =>
  ({ title, original_title: originalTitle }) =>
    title && // Check for title - may contain TV shows which use "name"
    (normalizeTitle(title) === normalizedTitle ||
      normalizeTitle(originalTitle) === normalizedTitle);

async function getBestMatch(titleQuery, rawResults = [], movie) {
  if (rawResults.length === 0) return undefined;

  const hasCrewForMovie = hasCrewFor(movie);

  // If there's only one result ...
  if (rawResults.length === 1) {
    const result = rawResults[0];
    // ... and there's no crew info, pick the result
    if (!hasCrewForMovie) return result;
    // ... and there's crew info, use it to match the result
    const hasCastCrewMatch = await matchesExpectedCastCrew(result, movie);
    return hasCastCrewMatch ? result : undefined;
  }

  // As we have more than 1 result, filter these down by removing any which
  // don't have a release date (if it's in the cinema, it should have a release
  // date available).
  const resultsWithReleaseDate = rawResults.filter(
    ({ release_date: date }) => !!date,
  );

  // If there's only a few results remaining ...
  if (resultsWithReleaseDate.length <= 3 && hasCrewForMovie) {
    // ... and there's crew info, use it to match a result ...
    for (const result of resultsWithReleaseDate) {
      const hasCastCrewMatch = await matchesExpectedCastCrew(result, movie);
      if (hasCastCrewMatch) return result;
    }
    // ... or reject the results if we can't match against any of them
    return undefined;
  }

  // As we still have more than 3 results, filter these down by removing any
  // which don't have the same normalized title as our query (this will probbaly
  // fail for foreign language films where the title may not match).
  const resultsWithSameTitle = resultsWithReleaseDate.filter(
    matchesMovieTitle(titleQuery),
  );

  // If there's only one result ...
  if (resultsWithSameTitle.length === 1) {
    const result = resultsWithSameTitle[0];
    // ... and there's no crew info, pick the result
    if (!hasCrewForMovie) return result;
    // ... and there's crew info, use it to match the result
    const hasCastCrewMatch = await matchesExpectedCastCrew(result, movie);
    return hasCastCrewMatch ? result : undefined;
  }

  // As we still have more than 1 result and there's crew info, use it to match the result
  if (hasCrewForMovie) {
    for (const result of resultsWithSameTitle) {
      const hasCastCrewMatch = await matchesExpectedCastCrew(result, movie);
      if (hasCastCrewMatch) return result;
    }
  }

  // As we still have more than 1 result and we've been provided some additional
  // data from the transform phase to help, use it to match the result
  if (movie.matchingHints) {
    for (const result of resultsWithSameTitle) {
      // Check if there's a matching overview.
      // (This specifically helps match movies at thearzner.com, which provides
      // very little data to match against except an overview which very often
      // matches the data from TheMovieDB)
      const hintOverview = movie.matchingHints.overview;
      if (hintOverview && result.overview) {
        const hint = comparableChunk(basicNormalize(hintOverview));
        const overview = comparableChunk(basicNormalize(result.overview));
        if (
          hint.length >= 50 &&
          overview.length >= 50 &&
          (hint.includes(overview) || overview.includes(hint))
        )
          return result;
      }

      // Check if there are matching characters in the overview.
      // (This specifically helps match throwback movies from Picturehouse where
      // very little data is provided to match against except an overview, which
      // _never_ matches the data from TheMovieDB)
      if (movie.matchingHints.characters && result.overview) {
        const hasAllCharacters = movie.matchingHints.characters.every(
          (character) => {
            const removeBrackets = character.replace(/\([^)]+\)/g, "").trim();
            const hint = normalizeName(removeBrackets);
            const overview = normalizeName(result.overview);
            return overview.includes(hint);
          },
        );
        if (hasAllCharacters) return result;
      }

      // Check if there are matching cast derrived from the synopsis. This may
      // contain garbage, or references to cast not in the movie, but it's some
      // kind of signal if we've failed on every other type of match.
      // (This specifically helps match throwback movies from Picturehouse where
      // very little data is provided to match against except an overview)
      if (movie.matchingHints.cast) {
        const updatedMovie = updateMovie(movie, {
          overview: { actors: movie.matchingHints.cast },
        });
        const matchesPossibleCast = await matchesExpectedCastCrew(
          result,
          updatedMovie,
        );
        if (matchesPossibleCast) return result;
      }
    }
  }

  // Reject the results if there are none that we can match confidently
  return undefined;
}

const tryFindingMatchUsingLlm = async (movie) => {
  let isMovie, confidence, matches;
  try {
    ({ isMovie, confidence, matches } = await askLlm(movie));
  } catch {
    console.log("Error asking LLM; retrying in 60 seconds...");
    // Most likely a rate limint was met; wait for 1 minute before trying again
    await new Promise((resolve) => setTimeout(resolve, 60000));
    ({ isMovie, confidence, matches } = await askLlm(movie));
  }

  // If we've confidence it's a movie, and it's a movie the LLM actually
  // knows of, then we can search again with updated information.
  if (isMovie && confidence >= 8 && matches[0].isKnownMovie) {
    const updatedMovie = updateMovie(movie, {
      title: matches[0].title,
      overview: {
        actors: matches[0].cast,
        directors: matches[0].directors,
      },
    });

    return await searchForBestMatch({
      normalizedTitle: normalizeTitle(updatedMovie.title),
      movie: updatedMovie,
      year: matches[0].year,
      isUsingLlmData: true,
    });
  }
};

const searchForBestMatch = async ({
  normalizedTitle,
  movie,
  year: yearValue,
  isUsingLlmData = false,
}) => {
  const slug = slugify(normalizedTitle, { strict: true }).toLowerCase();
  const matchByDirector = await findMovieByDirector(normalizedTitle, movie);
  if (matchByDirector) return matchByDirector;

  const cacheKeySuffix = `${yearValue || "no-year"}-${slug}`;
  const getPayload = (additional = {}) => ({
    query: normalizedTitle,
    ...additional,
  });

  // If there's no year provided, just search for the title
  if (!yearValue) {
    const searchTitle = await searchMovieAndCacheResults(
      `moviedb-search-title-${cacheKeySuffix}`,
      getPayload(),
    );
    const bestTitleMatch = await getBestMatch(
      normalizedTitle,
      searchTitle.results,
      movie,
    );

    if (bestTitleMatch) return bestTitleMatch;

    // Only run the LLM on this is we haven't already done so
    if (!isUsingLlmData) {
      const bestLlmMatch = await tryFindingMatchUsingLlm(movie);
      if (bestLlmMatch) return bestLlmMatch;
    }

    return null;
  }

  const year = parseInt(yearValue, 10);

  // Try to find a movie released on the year provided
  let searchPrimaryYear = await searchMovieAndCacheResults(
    `moviedb-search-primary-year-${cacheKeySuffix}`,
    getPayload({ primary_release_year: year }),
  );

  // Check we haven't matched a "making of" documentary, and if we have search
  // the previous year
  if (
    searchPrimaryYear.results.length === 1 &&
    searchPrimaryYear.results[0].title.toLowerCase().startsWith("making ")
  ) {
    searchPrimaryYear = await moviedb.searchMovie(
      getPayload({ primary_release_year: year - 1 }),
    );
  }

  const bestMatchPrimaryYear = await getBestMatch(
    normalizedTitle,
    searchPrimaryYear.results,
    movie,
  );
  if (bestMatchPrimaryYear) return bestMatchPrimaryYear;

  // Check we haven't matched a "making of" documentary, and if we have search
  // the previous year
  if (
    searchPrimaryYear.results.length === 1 &&
    searchPrimaryYear.results[0].title.toLowerCase().startsWith("making")
  ) {
    const searchPreviousYear = await searchMovieAndCacheResults(
      `moviedb-search-previous-year-${cacheKeySuffix}`,
      getPayload({ primary_release_year: year - 1 }),
    );
    const bestMatchPreviousYear = await getBestMatch(
      normalizedTitle,
      searchPreviousYear.results,
      movie,
    );
    if (bestMatchPreviousYear) return bestMatchPreviousYear;
  }

  // Try to find a movie with some release related to that year
  const seachRelatedYear = await searchMovieAndCacheResults(
    `moviedb-search-related-year-${cacheKeySuffix}`,
    getPayload({ year }),
  );
  const bestMatchRelatedYear = await getBestMatch(
    normalizedTitle,
    seachRelatedYear.results,
    movie,
  );
  if (bestMatchRelatedYear) return bestMatchRelatedYear;

  // Sometimes the movie listing has the year off by 1, so try to find a movie
  // with some release related to the next year
  const searchNextYear = await searchMovieAndCacheResults(
    `moviedb-search-next-year-${cacheKeySuffix}`,
    getPayload({ year: year + 1 }),
  );
  const bestMatchNextYear = await getBestMatch(
    normalizedTitle,
    searchNextYear.results,
    movie,
  );
  if (bestMatchNextYear) return bestMatchNextYear;

  // If we have crew information for the movie, maybe the year is wrong so let's
  // try matching without it
  if (hasCrewFor(movie)) {
    const searchWithoutYear = await searchMovieAndCacheResults(
      `moviedb-search-without-year-${cacheKeySuffix}`,
      getPayload(),
    );
    const bestWithoutYearMatch = await getBestMatch(
      normalizedTitle,
      searchWithoutYear.results,
      movie,
    );
    if (bestWithoutYearMatch) return bestWithoutYearMatch;
  }

  // Only run the LLM on this is we haven't already done so
  if (!isUsingLlmData) {
    const bestLlmMatch = await tryFindingMatchUsingLlm(movie);
    if (bestLlmMatch) return bestLlmMatch;
  }

  return null;
};

const getMovieInfoAndCacheResults = ({ id }) =>
  dailyCache(`moviedb-info-${id}`, async () => {
    const payload = {
      id,
      append_to_response: "credits,external_ids,keywords,release_dates,videos",
    };
    return moviedb.movieInfo(payload);
  });

const getMovieGenresAndCacheResults = () =>
  dailyCache(`moviedb-genres`, async () => {
    return moviedb.genreMovieList();
  });

const searchMovieAndCacheResults = (cacheKey, payload) =>
  dailyCache(cacheKey, async () => moviedb.searchMovie(payload));

const searchPersonAndCacheResults = (cacheKey, query) =>
  dailyCache(cacheKey, async () => moviedb.searchPerson({ query }));

const getPersonMovieCreditsAndCacheResults = (id) =>
  dailyCache(`moviedb-person-movie-credits-${id}`, async () =>
    moviedb.personMovieCredits({ id }),
  );

module.exports = {
  searchForBestMatch,
  getMovieInfoAndCacheResults,
  getMovieGenresAndCacheResults,
};
