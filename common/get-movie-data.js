const { MovieDb } = require("moviedb-promise");
const diff = require("fast-diff");
const normalizeTitle = require("./normalize-title");
const normalizeName = require("./normalize-name");
const { dailyCache } = require("./cache");
require("dotenv").config();

const moviedb = new MovieDb(process.env.MOVIEDB_API_KEY);

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

const matchesExpectedCastCrew = async (match, show) => {
  let movieInfo;
  try {
    movieInfo = await getMovieInfoAndCacheResults(match);
  } catch (e) {
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
    const directors = show.overview.directors.map((name) =>
      normalizeName(name),
    );

    // Don't bother checking the Opera listings, they're usualy wrong
    if (directors.length && directors[0] === "themetropolitanopera") {
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
    const actors = show.overview.actors.map((name) => normalizeName(name));

    const actorMatches = cast.filter((member) =>
      actors.some((actor) => compareAsSimilar(actor, member)),
    );
    if (actorMatches.length > 0) return true;
  }

  return false;
};

const hasCrewFor = (show) =>
  show.overview.directors.length > 0 || show.overview.actors.length > 0;

async function getBestMatch(titleQuery, rawResults = [], show) {
  if (rawResults.length === 0) return undefined;

  const hasCrewForShow = hasCrewFor(show);

  // If there's only one result ...
  if (rawResults.length === 1) {
    const result = rawResults[0];
    // ... and there's no crew info, pick the result
    if (!hasCrewForShow) return result;
    // ... and there's crew info, use it to match the result
    const hasCastCrewMatch = await matchesExpectedCastCrew(result, show);
    return hasCastCrewMatch ? result : undefined;
  }

  // As we have more than 1 result, filter these down by removing any which
  // don't have a release date (if it's in the cinema, it should have a release
  // date available).
  const resultsWithReleaseDate = rawResults.filter(
    ({ release_date: date }) => !!date,
  );

  // If there's only a few results remaining ...
  if (resultsWithReleaseDate.length <= 3) {
    // ... and there's no crew info, pick the first as the most likely
    if (!hasCrewForShow) return resultsWithReleaseDate[0];
    // ... and there's crew info, use it to match a result ...
    for (result of resultsWithReleaseDate) {
      const hasCastCrewMatch = await matchesExpectedCastCrew(result, show);
      if (hasCastCrewMatch) return result;
    }
    // ... or reject the results if we can't match against any of them
    return undefined;
  }

  // As we still have more than 3 results, filter these down by removing any
  // which don't have the same normalized title as our query (this will probbaly
  // fail for foreign language films where the title may not match).
  const resultsWithSameTitle = resultsWithReleaseDate.filter(
    ({ title, original_title: originalTitle }) =>
      normalizeTitle(title) === titleQuery ||
      normalizeTitle(originalTitle) === titleQuery,
  );

  // If there's only one result ...
  if (resultsWithSameTitle.length === 1) {
    const result = resultsWithSameTitle[0];
    // ... and there's no crew info, pick the result
    if (!hasCrewForShow) return result;
    // ... and there's crew info, use it to match the result
    const hasCastCrewMatch = await matchesExpectedCastCrew(result, show);
    return hasCastCrewMatch ? result : undefined;
  }

  // As we still have more than 1 result ...
  if (!hasCrewForShow) {
    // If there's no crew info, pick the most popular so long as it's has a
    // relatively high level of popularity.
    const relativelyHighPopularity = 15;
    const popularResults = resultsWithSameTitle
      .filter(({ popularity }) => popularity > relativelyHighPopularity)
      .sort((a, b) => b.popularity - a.popularity);
    if (popularResults.length > 0) return popularResults[0];
  } else {
    // If there's crew info, use it to match the result
    for (result of resultsWithSameTitle) {
      const hasCastCrewMatch = await matchesExpectedCastCrew(result, show);
      if (hasCastCrewMatch) return result;
    }
  }

  // Reject the results if there are none that we can match confidently
  return undefined;
}

const searchForBestMatch = async ({
  normalizedTitle,
  slug,
  show,
  year: yearValue,
}) => {
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
      show,
    );
    return bestTitleMatch || null;
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
    show,
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
      show,
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
    show,
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
    show,
  );
  if (bestMatchNextYear) return bestMatchNextYear;

  // If we have crew information for the show, maybe the year is wrong so let's
  // try matching without it
  if (hasCrewFor(show)) {
    const searchWithoutYear = await searchMovieAndCacheResults(
      `moviedb-search-without-year-${cacheKeySuffix}`,
      getPayload(),
    );
    const bestWithoutYearMatch = await getBestMatch(
      normalizedTitle,
      searchWithoutYear.results,
      show,
    );
    if (bestWithoutYearMatch) return bestWithoutYearMatch;
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

module.exports = {
  searchForBestMatch,
  getMovieInfoAndCacheResults,
  getMovieGenresAndCacheResults,
};
