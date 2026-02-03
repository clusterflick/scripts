const { MovieDb } = require("moviedb-promise");
const slugify = require("slugify");
const normalizeTitle = require("./normalize-title");
const normalizeName = require("./normalize-name");
const {
  basicNormalize,
  compareAsSimilar,
  runLlmFunction,
  sleep,
} = require("./utils");
const { dailyCache } = require("./cache");
const askLlm = require("./ask-llm");
const askLlmToReviewResults = require("./ask-llm-to-review-results");
require("dotenv").config();

/**
 * Specifically ignored IDs from the Movie DB
 * This may be to low quality entry, duplicate, pending deletion, or a
 * high-probability of mismatch, etc.
 */
const ignoredIds = [
  1526154, // Le making of de Nouvelle Vague -- https://www.themoviedb.org/movie/1526154-le-making-of-de-nouvelle-vague
  766878, // Screening -- https://www.themoviedb.org/movie/766878-screening
  978656, // An Introduction to David Lynch -- https://www.themoviedb.org/movie/-an-introduction-to-david-lynch
  894857, // Desiree Burch: Unf*ckable -- https://www.themoviedb.org/movie/894857-desiree-burch-unf-ckable
  36883, // Midnight Movies: From the Margin to the Mainstream -- https://www.themoviedb.org/movie/36883-midnight-movies-from-the-margin-to-the-mainstream
  598681, // WTF? -- https://www.themoviedb.org/movie/-wtf
  1554871, // Superman -- https://www.themoviedb.org/movie/1554871-superman
  223575, // Song Sung Blue -- https://www.themoviedb.org/movie/-song-sung-blue
  1082548, // My Father's Shadow -- https://www.themoviedb.org/movie/1082548-my-father-s-shadow
  373903, //  National Theatre Live: Les Liaisons Dangereuses (2016) -- https://www.themoviedb.org/movie/373903-national-theatre-live-les-liaisons-dangereuses
  133882, // Murcof, Erik Truffaz & Talvin Singh - Montreux Jazz Festival -- https://www.themoviedb.org/movie/133882-murcof-erik-truffaz-talvin-singh-montreux-jazz-festival
  1342278, // Pave Paradise -- https://www.themoviedb.org/movie/1342278
  229310, // Entry -- https://www.themoviedb.org/movie/229310-entry
  681293, // Shortcuts -- https://www.themoviedb.org/movie/681293-shortcuts
  1575833, // Nuremberg: The Real Story -- https://www.themoviedb.org/movie/1575833-nuremberg-the-real-story
  477391, // Film Festival -- https://www.themoviedb.org/movie/477391
  444768, // Wash It -- https://www.themoviedb.org/movie/444768-wash-it
];

/**
 * Specifically forced match to IDs from the Movie DB
 * This may be due to low information provided by venue sites for common single
 * word titles which will therefore not match.
 */
const forcedMatches = {
  elf: 10719, // https://www.themoviedb.org/movie/10719-elf
  holiday: 1581, // https://www.themoviedb.org/movie/1581-the-holiday
  notebook: 11036, // https://www.themoviedb.org/movie/11036-the-notebook
  sham: 1423983, // https://www.themoviedb.org/movie/1423983
  mummy: 564, // https://www.themoviedb.org/movie/564-the-mummy
  "oversabi aunty": 1594952, // https://www.themoviedb.org/movie/1594952-oversabi-aunty
  "romeo+juliet": 454, // https://www.themoviedb.org/movie/454-romeo-juliet
  lorax: 73723, // https://www.themoviedb.org/movie/73723-the-lorax
};

function getForcedMatch(normalizedTitle) {
  const matchId = forcedMatches[normalizedTitle];
  if (!matchId) return null;
  return getMovieInfoAndCacheResults({ id: matchId });
}

const applyNameCorrections = (name) =>
  name.replace(/Scott McGhee/i, "Scott McGehee");

const apiRetryWrapper = async (callback) => {
  try {
    return await callback();
  } catch (e) {
    console.log(
      `Error contacting themoviedb; trying again in 60 seconds - ${e.message}`,
    );
    await sleep(60_000);
    return await callback();
  }
};

const moviedb = new MovieDb(process.env.MOVIEDB_API_KEY);

const comparableChunk = (value) => value.replace(/\s+/g, "").slice(0, 200);

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

  // Only attempt to match if there's crew information to check against
  if (crew.length > 0) {
    const movieDirectors = [
      ...movie.overview.directors,
      ...(movie.matchingHints?.crew || []),
    ];
    const directors = movieDirectors.map((name) => normalizeName(name));

    // Don't bother checking the Opera listings, they're usualy wrong
    // TODO: This may be problematic as it'll just match any entry which has
    // crew, even if it's the wrong one...
    if (
      directors.length &&
      basicNormalize(directors[0]).includes("metropolitanopera")
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
  }

  // Only attepmpt to match if there's crew information to check against
  if (crew.length > 0) {
    // Sometimes cinemas will mistakenly put the director in as cast. If we
    // haven't found a match yet, let's try checking the crew against the
    // actors list to see if we find a match.
    const actors = movie.overview.actors.map((name) => normalizeName(name));

    const directorMatches = crew.filter((member) =>
      actors.some((actor) => compareAsSimilar(actor, member)),
    );
    if (directorMatches.length > 0) return true;
  }

  return false;
};

async function findMovieByDirector(normalizedTitle, movie) {
  const movieDirectors = [
    ...movie.overview.directors,
    ...(movie.matchingHints?.crew || []),
  ];
  if (movieDirectors.length === 0) return;

  const directorsName = applyNameCorrections(movieDirectors[0]);
  const peopleMatches = await searchPersonAndCacheResults(
    `moviedb-search-person-${slugify(basicNormalize(directorsName))}`,
    directorsName,
  );

  if (peopleMatches.results.length === 0) return null;

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

  // If we can't find a director, give the most popular result a chance
  if (directors.length === 0) {
    directors = [
      peopleMatches.results.sort((a, b) => b.popularity - a.popularity)[0],
    ];
  }

  // Limit queries to just 3 matches
  for (const director of directors.slice(0, 3)) {
    // Get the full list of movie credits for the director, filter down to just
    // their directing credits, and match against those
    const credits = await getPersonMovieCreditsAndCacheResults(director.id);
    const directorCredits = credits.crew.filter(
      ({ job }) => job && basicNormalize(job) === "director",
    );

    // Remove specifically ignored entries from the Movie DB
    const directorCreditsWithoutIgnored = directorCredits.filter(
      ({ id }) => !ignoredIds.includes(id),
    );

    const resultsWithSameTitle = directorCreditsWithoutIgnored.filter(
      matchesMovieTitle(normalizedTitle),
    );
    if (resultsWithSameTitle.length === 1) return resultsWithSameTitle[0];
  }
}

const hasCrewFor = (movie) =>
  movie.overview.directors.length > 0 || movie.overview.actors.length > 0;

const hasCrewHintsFor = (movie) => movie.matchingHints?.crew?.length > 0;

const matchesMovieTitle =
  (normalizedTitle) =>
  ({ title, original_title: originalTitle }) =>
    title && // Check for title - may contain TV shows which use "name"
    (normalizeTitle(title) === normalizedTitle ||
      normalizeTitle(originalTitle) === normalizedTitle);

async function getBestMatch(titleQuery, rawResults = [], movie) {
  if (rawResults.length === 0) return undefined;

  const hasCrewForMovie = hasCrewFor(movie);
  const hasCrewHintsForMovie = hasCrewHintsFor(movie);

  // If there's only one result ...
  if (rawResults.length === 1) {
    const result = rawResults[0];
    // ... and there's no crew info, pick the result if it matches the title
    if (!hasCrewForMovie && matchesMovieTitle(titleQuery)(result)) {
      return result;
    }
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
  if (
    resultsWithReleaseDate.length <= 3 &&
    (hasCrewForMovie || hasCrewHintsForMovie)
  ) {
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
  if (hasCrewForMovie || hasCrewHintsForMovie) {
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
        ) {
          return result;
        }
      }

      // Check if there are matching characters in the overview.
      // (This specifically helps match throwback movies from Picturehouse where
      // very little data is provided to match against except an overview, which
      // _never_ matches the data from TheMovieDB)
      const hintCharacters = movie.matchingHints.characters;
      if (hintCharacters && hintCharacters.length > 0 && result.overview) {
        const hasAllCharacters = hintCharacters.every((character) => {
          const removeBrackets = character.replace(/\([^)]+\)/g, "").trim();
          const hint = normalizeName(removeBrackets);
          const overview = normalizeName(result.overview);
          return overview.includes(hint);
        });
        if (hasAllCharacters) {
          return result;
        }
      }

      // Check if there are matching cast derrived from the synopsis. This may
      // contain garbage, or references to cast not in the movie, but it's some
      // kind of signal if we've failed on every other type of match.
      // (This specifically helps match throwback movies from Picturehouse where
      // very little data is provided to match against except an overview)
      const hintCast = movie.matchingHints.cast;
      if (hintCast && hintCast.length > 0) {
        const updatedMovie = updateMovie(movie, {
          overview: { actors: hintCast },
        });
        const matchesPossibleCast = await matchesExpectedCastCrew(
          result,
          updatedMovie,
        );
        if (matchesPossibleCast) {
          return result;
        }
      }

      // Check if there are matching crew. Most likely this will have been used
      // as a hard coded (but time bound) hint to match a movie with
      // insufficient data. e.g. "Close-Up on Abbas Kiarostami"
      const hintCrew = movie.matchingHints.crew;
      if (hintCrew && hintCrew.length > 0) {
        const updatedMovie = updateMovie(movie, {
          overview: { directors: hintCrew },
        });
        const matchesPossibleCrew = await matchesExpectedCastCrew(
          result,
          updatedMovie,
        );
        if (matchesPossibleCrew) {
          return result;
        }
      }
    }
  }

  // Reject the results if there are none that we can match confidently
  return undefined;
}

const tryFindingMatchUsingLlm = async (movie) => {
  const result = await runLlmFunction(() => askLlm(movie));
  if (result === null) return null;

  const { isMovie, isMultipleMovies, confidence, matches } = result;

  if (
    // Check it's a single movie
    isMovie &&
    !isMultipleMovies &&
    // The LLM is confident it's a movie and has heard of it
    ((confidence >= 8 && matches[0].isKnownMovie) ||
      // The LLM is very confident it's a movie, includes a release year or directors, but hasn't heard of it
      (confidence === 9 &&
        !matches[0].isKnownMovie &&
        (!!matches[0].year || matches[0].directors.length > 0)))
  ) {
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

  return null;
};

const reviewResultsUsingLlm = async (movie, results, normalizedTitle) => {
  const result = await runLlmFunction(() =>
    askLlmToReviewResults(movie, results, normalizedTitle),
  );
  if (result === null) return null;

  const { confidence, match } = result;

  if (confidence >= 7) {
    const matchingResult = results.find(({ id }) => id === match?.id);
    if (matchingResult) return matchingResult;
  }

  return null;
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

    const searchTitleIncludingAdult = await searchMovieAndCacheResults(
      `moviedb-search-title-including-adult-${cacheKeySuffix}`,
      getPayload({ include_adult: true }),
    );
    const bestTitleIncludingAdultMatch = await getBestMatch(
      normalizedTitle,
      searchTitleIncludingAdult.results,
      movie,
    );

    if (bestTitleIncludingAdultMatch) return bestTitleIncludingAdultMatch;

    // Only run the LLM on this is we haven't already done so
    if (!isUsingLlmData) {
      if (searchTitle.results.length > 0) {
        const bestLlmMatchFromResults = await reviewResultsUsingLlm(
          movie,
          searchTitle.results,
          normalizedTitle,
        );
        if (bestLlmMatchFromResults) return bestLlmMatchFromResults;
      }

      const bestLlmMatch = await tryFindingMatchUsingLlm(movie);
      if (bestLlmMatch) return bestLlmMatch;
    }

    if (movie.matchingHints?.year) {
      yearValue = movie.matchingHints?.year;
    } else {
      const forcedMatch = await getForcedMatch(normalizedTitle);
      return forcedMatch || null;
    }
  }

  const year = parseInt(yearValue, 10);

  // Try to find a movie released on the year provided
  const searchPrimaryYear = await searchMovieAndCacheResults(
    `moviedb-search-primary-year-${cacheKeySuffix}`,
    getPayload({ primary_release_year: year }),
  );

  const bestMatchPrimaryYear = await getBestMatch(
    normalizedTitle,
    searchPrimaryYear.results,
    movie,
  );

  // If we have a match but it's a "making of" documentary, then search the
  // previous year for a match
  if (
    bestMatchPrimaryYear &&
    bestMatchPrimaryYear.title.toLowerCase().startsWith("making ")
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

    // If we have a match, then return it
  } else if (bestMatchPrimaryYear) {
    return bestMatchPrimaryYear;

    // If we don't have a match, check adult results
  } else {
    const searchPrimaryYearIncludingAdult = await searchMovieAndCacheResults(
      `moviedb-search-primary-year-including-adult-${cacheKeySuffix}`,
      getPayload({ primary_release_year: year, include_adult: true }),
    );
    const bestMatchPrimaryYearIncludingAdult = await getBestMatch(
      normalizedTitle,
      searchPrimaryYearIncludingAdult.results,
      movie,
    );
    if (bestMatchPrimaryYearIncludingAdult) {
      return bestMatchPrimaryYearIncludingAdult;
    }
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
    if (seachRelatedYear.results.length > 0) {
      const bestLlmMatchFromResults = await reviewResultsUsingLlm(
        movie,
        seachRelatedYear.results,
      );
      if (bestLlmMatchFromResults) return bestLlmMatchFromResults;
    }

    const bestLlmMatch = await tryFindingMatchUsingLlm(movie);
    if (bestLlmMatch) return bestLlmMatch;
  }

  const forcedMatch = await getForcedMatch(normalizedTitle);
  return forcedMatch || null;
};

const getMovieInfoAndCacheResults = ({ id }) =>
  dailyCache(`moviedb-info-${id}`, async () => {
    const payload = {
      id,
      append_to_response:
        "credits,external_ids,keywords,release_dates,videos,alternative_titles",
    };
    return apiRetryWrapper(() => moviedb.movieInfo(payload));
  });

const getMovieGenresAndCacheResults = () =>
  dailyCache(`moviedb-genres`, async () =>
    apiRetryWrapper(() => moviedb.genreMovieList()),
  );

const searchMovieAndCacheResults = (cacheKey, payload) =>
  dailyCache(cacheKey, async () => {
    const firstPage = await apiRetryWrapper(() => moviedb.searchMovie(payload));
    let results = [].concat(firstPage.results);
    let pages = [1];

    // Get up to 5 pages of results, or all pages, whichever is smaller
    const maxPages = Math.min(5, firstPage.total_pages);
    for (let page = 2; page <= maxPages; page++) {
      const nextPage = await apiRetryWrapper(() =>
        moviedb.searchMovie({ ...payload, page }),
      );
      pages = pages.concat(page);
      results = results.concat(nextPage.results);
    }

    // Remove specifically ignored entries from the Movie DB
    results = results.filter(({ id }) => !ignoredIds.includes(id));

    return { ...firstPage, results, pages };
  });

const searchPersonAndCacheResults = (cacheKey, query) =>
  dailyCache(cacheKey, async () =>
    apiRetryWrapper(() => moviedb.searchPerson({ query, include_adult: true })),
  );

const getPersonMovieCreditsAndCacheResults = (id) =>
  dailyCache(`moviedb-person-movie-credits-${id}`, async () =>
    apiRetryWrapper(() => moviedb.personMovieCredits({ id })),
  );

module.exports = {
  searchForBestMatch,
  getMovieInfoAndCacheResults,
  getMovieGenresAndCacheResults,
};
