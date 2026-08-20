const { MovieDb } = require("moviedb-promise");
const slugify = require("slugify");
const normalizeTitle = require("./normalize-title");
const normalizeName = require("./normalize-name");
const {
  basicNormalize,
  compareAsSimilar,
  runLlmFunction,
  withRetry,
  RETRYABLE_STATUSES,
  parseRetryAfter,
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
  335380, // Open Door: The Other Cinema -- https://www.themoviedb.org/movie/335380-open-door-the-other-cinema
  340476, // 5:45 AM -- https://www.themoviedb.org/movie/340476-5-45-am
  1424169, // The Birthday Party -- https://www.themoviedb.org/movie/1424169-the-birthday-party
  628403, // Metallica: Master of Puppets (Deluxe Box Set) -- https://www.themoviedb.org/movie/628403-metallica-master-of-puppets-deluxe-box-set
  155553, // Rock Milestones: Metallica: Master of Puppets -- https://www.themoviedb.org/movie/-metallica-rock-milestones-master-of-puppets
  892807, // The Sunset Strip Killers: Born To Kill? -- https://www.themoviedb.org/movie/892807-the-sunset-strip-killers-born-to-kill
  77835, // The Beatles - Unsurpassed Promos -- https://www.themoviedb.org/movie/77835-the-beatles-unsurpassed-promos
  997326, // Father -- https://www.themoviedb.org/movie/997326-father
  1322900, // T. REX 3D -- https://www.themoviedb.org/movie/1322900-t-rex-3d
  1286035, // Short -- https://www.themoviedb.org/movie/1286035-short
  491034, // This is Home -- https://www.themoviedb.org/movie/491034-this-is-home
  1047214, // Global -- https://www.themoviedb.org/movie/1047214-global
  848261, // Drive, Come On -- https://www.themoviedb.org/movie/848261
  1040037, // Whitney Houston: I Wanna Dance With Somebody -- https://www.themoviedb.org/movie/-whitney-houston-i-wanna-dance-with-somebody
  1139605, // Back to the Future -- https://www.themoviedb.org/movie/1139605-back-to-the-future
  492541, // Legally Blonde -- https://www.themoviedb.org/movie/492541-legally-blonde
  1354515, // ratatouille -- https://www.themoviedb.org/movie/1354515-ratatouille
  837734, // Ratatouille (C) -- https://www.themoviedb.org/movie/837734-ratatouille-c
  1399098, // Encanto -- https://www.themoviedb.org/movie/1399098-encanto
  41233, // Step Up 3D -- https://www.themoviedb.org/movie/41233-step-up-3d
  129284, // The Dude -- https://www.themoviedb.org/movie/129284-the-dude
  1666176, // Inferno -- https://www.themoviedb.org/movie/1666176-inferno
  1662113, // Test Film -- https://www.themoviedb.org/movie/1662113-test-film
  1698863, // The Odyssey -- https://www.themoviedb.org/movie/1698863-the-odyssey
  1389260, // Così fan tutte -- https://www.themoviedb.org/movie/1389260-cosi-fan-tutte
  858680, // World CUP -- https://www.themoviedb.org/movie/858680-world-cup
  1254413, // RiffTrax Live: Point Break -- https://www.themoviedb.org/movie/1254413-rifftrax-live-point-break
  1308510, // Hard Days Night -- https://www.themoviedb.org/movie/1308510-hard-days-night
  1234194, // Test Screening -- https://www.themoviedb.org/movie/1234194-test-screening
  442825, // Cinematography -- https://www.themoviedb.org/movie/442825-cinematografia
  1627130, // Renoir in Love -- https://www.themoviedb.org/movie/-renoir-in-love
  1361920, // Sinners -- https://www.themoviedb.org/movie/1361920-sinners
];

/**
 * Specifically forced match to IDs from the Movie DB
 * This may be due to low information provided by venue sites for common single
 * word titles which will therefore not match.
 */
const forcedMatches = {
  aladdin: 812, // https://www.themoviedb.org/movie/812-aladdin
  babe: 9598, // https://www.themoviedb.org/movie/9598-babe
  barbie: 346698, // https://www.themoviedb.org/movie/346698-barbie
  big: 2280, // https://www.themoviedb.org/movie/2280-big
  coda: 776503, // https://www.themoviedb.org/movie/776503-coda
  casablanca: 289, // https://www.themoviedb.org/movie/289-casablanca
  "catch me if you can": 640, // https://www.themoviedb.org/movie/640-catch-me-if-you-can
  "cheaper by the dozen": 11007, // https://www.themoviedb.org/movie/11007-cheaper-by-the-dozen
  clueless: 9603, // https://www.themoviedb.org/movie/9603-clueless
  coco: 354912, // https://www.themoviedb.org/movie/354912-coco
  "dirty dancing": 88, // https://www.themoviedb.org/movie/88-dirty-dancing
  dogman: 944401, // https://www.themoviedb.org/movie/944401-dogman
  "dune part one": 438631, // https://www.themoviedb.org/movie/438631-dune
  elf: 10719, // https://www.themoviedb.org/movie/10719-elf
  elvis: 614934, // https://www.themoviedb.org/movie/614934-elvis
  flow: 823219, // https://www.themoviedb.org/movie/823219-straume
  goat: 1297842, // https://www.themoviedb.org/movie/1297842-goat
  grease: 621, // https://www.themoviedb.org/movie/621-grease
  honey: 10028, // https://www.themoviedb.org/movie/10028-honey
  "high school musical": 10947, // https://www.themoviedb.org/movie/10947-high-school-musical
  holiday: 1581, // https://www.themoviedb.org/movie/1581-the-holiday
  "i swear": 1317149, // https://www.themoviedb.org/movie/1317149-i-swear
  "independence day": 602, // https://www.themoviedb.org/movie/602-independence-day
  jaws: 578, // https://www.themoviedb.org/movie/578-jaws
  "la la land": 313369, // https://www.themoviedb.org/movie/313369-la-la-land
  labyrinth: 13597, //https://www.themoviedb.org/movie/13597-labyrinth
  lorax: 73723, // https://www.themoviedb.org/movie/73723-the-lorax
  madagascar: 953, // https://www.themoviedb.org/movie/953-madagascar
  "mamma mia": 11631, // https://www.themoviedb.org/movie/11631-mamma-mia
  migration: 940551, // https://www.themoviedb.org/movie/940551-migration
  mummy: 564, // https://www.themoviedb.org/movie/564-the-mummy
  notebook: 11036, // https://www.themoviedb.org/movie/11036-the-notebook
  "oversabi aunty": 1594952, // https://www.themoviedb.org/movie/1594952-oversabi-aunty
  pocahontas: 10530, // https://www.themoviedb.org/movie/10530-pocahontas
  "rental family": 1208348, // https://www.themoviedb.org/movie/1208348-rental-family
  "roman holiday": 804, // https://www.themoviedb.org/movie/804-roman-holiday
  "romeo+juliet": 454, // https://www.themoviedb.org/movie/454-romeo-juliet
  "seven year itch": 10653, // https://www.themoviedb.org/movie/10653-the-seven-year-itch
  "some like it hot": 239, // https://www.themoviedb.org/movie/239-some-like-it-hot
  sham: 1423983, // https://www.themoviedb.org/movie/1423983
  "singin in the rain": 872, // https://www.themoviedb.org/movie/872-singin-in-the-rain
  tangled: 38757, // https://www.themoviedb.org/movie/38757-tangled
  "theory of everything": 266856, // https://www.themoviedb.org/movie/266856-the-theory-of-everything
  "top gun": 744, // https://www.themoviedb.org/movie/744-top-gun
  twilight: 8966, // https://www.themoviedb.org/movie/8966-twilight
  "walk the line": 69, // https://www.themoviedb.org/movie/
  wicked: 402431, // https://www.themoviedb.org/movie/402431-wicked
  "wizard of oz": 630, // https://www.themoviedb.org/movie/630-the-wizard-of-oz
};

function getForcedMatch(normalizedTitle) {
  const matchId = forcedMatches[normalizedTitle];
  if (!matchId) return null;
  return getMovieInfoAndCacheResults({ id: matchId });
}

const applyNameCorrections = (name) =>
  name.replace(/Scott McGhee/i, "Scott McGehee");

const apiRetryWrapper = async (callback) => {
  return withRetry(
    async () => {
      try {
        return await callback();
      } catch (e) {
        const status = e.response?.status;
        // A non-retryable 4xx (400/401/404/...) is a genuine failure, not a
        // rate limit — fail immediately rather than burning the retry budget.
        if (status && !RETRYABLE_STATUSES.has(status)) {
          e.retryable = false;
          throw e;
        }
        e.retryAfterMs = parseRetryAfter(e.response?.headers?.["retry-after"]);
        throw e;
      }
    },
    { retries: 3, delayMs: 60_000, label: "themoviedb" },
  );
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

const isDirecting = ({ known_for_department: department }) =>
  !!department && basicNormalize(department) === "directing";

// An exact name match outranks the department, which outranks popularity.
const scorePerson = (searchedName) => (person) => {
  const nameOptions = [
    normalizeName(person.name),
    normalizeName(person.name.split(" ").reverse().join(" ")),
  ];
  return (
    (nameOptions.includes(normalizeName(searchedName)) ? 2 : 0) +
    (isDirecting(person) ? 1 : 0)
  );
};

// Rank rather than filter. Filtering down to just those known for directing
// discards the right person whenever TheMovieDB files a director under another
// department - producer-directors are commonly under "Production".
const rankPeople = (searchedName, people) => {
  const score = scorePerson(searchedName);
  return [...people].sort(
    (a, b) => score(b) - score(a) || b.popularity - a.popularity,
  );
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

  const directors = rankPeople(directorsName, peopleMatches.results);

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

// Check for crew and actors, but ignore live threatre events which have poor data
const hasCrewFor = (movie, normalizeTitle) =>
  (movie.overview.directors.length > 0 || movie.overview.actors.length > 0) &&
  !normalizeTitle.startsWith("metropolitan opera") &&
  !normalizeTitle.startsWith("royal ballet opera");

const hasCrewHintsFor = (movie) => movie.matchingHints?.crew?.length > 0;

const matchesMovieTitle =
  (normalizedTitle) =>
  ({ title, original_title: originalTitle }) =>
    title && // Check for title - may contain TV shows which use "name"
    (normalizeTitle(title) === normalizedTitle ||
      normalizeTitle(originalTitle) === normalizedTitle);

// Movies in cinemas always have a release date. Entries without one are likely
// collections, which share a numeric ID namespace with movies but return 404
// from movieInfo.
const isReleasedMovie = ({ release_date: date }) => !!date;

async function getBestMatch(titleQuery, rawResults = [], movie) {
  if (rawResults.length === 0) return undefined;

  const hasCrewForMovie = hasCrewFor(movie, titleQuery);
  const hasCrewHintsForMovie = hasCrewHintsFor(movie);

  const resultsWithReleaseDate = rawResults.filter(isReleasedMovie);

  // If there's only one result ...
  if (resultsWithReleaseDate.length === 1) {
    const result = resultsWithReleaseDate[0];
    // ... and there's no crew info, pick the result if it matches the title
    if (!hasCrewForMovie && matchesMovieTitle(titleQuery)(result)) {
      return result;
    }
    // ... and there's crew info, use it to match the result
    const hasCastCrewMatch = await matchesExpectedCastCrew(result, movie);
    return hasCastCrewMatch ? result : undefined;
  }

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
    !!matches[0] &&
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

  if (confidence >= 8) {
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
      const searchTitleResultsWithReleaseDate =
        searchTitle.results.filter(isReleasedMovie);
      if (searchTitleResultsWithReleaseDate.length > 0) {
        const bestLlmMatchFromResults = await reviewResultsUsingLlm(
          movie,
          searchTitleResultsWithReleaseDate,
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
  if (hasCrewFor(movie, normalizedTitle)) {
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
    const seachRelatedYearResultsWithReleaseDate =
      seachRelatedYear.results.filter(isReleasedMovie);
    if (seachRelatedYearResultsWithReleaseDate.length > 0) {
      const bestLlmMatchFromResults = await reviewResultsUsingLlm(
        movie,
        seachRelatedYearResultsWithReleaseDate,
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

const getCollectionInfoAndCacheResults = ({ id }) =>
  dailyCache(`moviedb-collection-${id}`, async () =>
    apiRetryWrapper(() => moviedb.collectionInfo({ id })),
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
  rankPeople,
  searchForBestMatch,
  getMovieInfoAndCacheResults,
  getMovieGenresAndCacheResults,
  getCollectionInfoAndCacheResults,
};
