const normalizeName = require("../../common/normalize-name");
const normalizeTitle = require("../../common/normalize-title");
const { compareAsSimilar, basicNormalize } = require("../../common/utils");

const getNameOptions = (name) => [
  normalizeName(name),
  // Reverse order of names
  normalizeName(name.split(" ").reverse().join(" ")),
  // Remove middle names
  normalizeName(`${name.split(" ").at(0)} ${name.split(" ").at(-1)}`),
  // Just first initial of first name, in case abreviations are being used
  normalizeName(`${name.split(" ").at(0)[0]} ${name.split(" ").at(-1)}`),
];

const getDirectors = (credits) =>
  (credits?.crew ?? [])
    .filter(({ job }) => basicNormalize(job) === "director")
    .flatMap(({ name }) => getNameOptions(name));

const getMatchFromSearchResults = async (
  movie,
  searchResults,
  matcher,
  getDirectorsForMatch,
) => {
  const match = searchResults.find(
    ({ title, year }) =>
      (normalizeTitle(title) === normalizeTitle(movie.title) ||
        normalizeTitle(title) === normalizeTitle(movie.originalTitle) ||
        normalizeTitle(title) === normalizeTitle(movie.americanTitle)) &&
      matcher({ title, year }, movie),
  );
  if (!match) return;

  // Don't try to check director for theatre recordings
  if (
    normalizeTitle(movie.title).startsWith("metropolitan opera ") ||
    normalizeTitle(movie.title).startsWith("national theatre ")
  ) {
    return match;
  }

  const directorsForMatch = await getDirectorsForMatch(match);
  if (directorsForMatch.length === 0) return;

  const directorsForMatchOptions = directorsForMatch.flatMap(getNameOptions);
  const matchingDirector = getDirectors(movie.credits).find((movieDirector) =>
    directorsForMatchOptions.some((directorForMatchOption) =>
      compareAsSimilar(
        normalizeName(movieDirector),
        normalizeName(directorForMatchOption),
      ),
    ),
  );
  if (matchingDirector) return match;
};

const narrowYearRangeMatcher = (searchResult, movie) => {
  const searchResultYear = parseInt(searchResult.year, 10);
  const movieYear = parseInt(movie.year, 10);
  return searchResultYear >= movieYear - 1 && searchResultYear <= movieYear + 1;
};

const broadYearRangeMatcher = (searchResult, movie) => {
  const searchResultYear = parseInt(searchResult.year, 10);
  const movieYear = parseInt(movie.year, 10);
  return searchResultYear >= movieYear - 7 && searchResultYear <= movieYear + 7;
};

const noYearRangeMatcher = () => {
  return true;
};

const normaliseAndParseInt = (value) => parseInt(value.replaceAll(",", ""), 10);

const getMatch = async (movie, getSearchResults, getDirectorsForMatch) => {
  // Search using the US title
  const searchResultsTitleUs = await getSearchResults(movie.americanTitle);

  const matchFromTitleResultsUs = await getMatchFromSearchResults(
    movie,
    searchResultsTitleUs,
    narrowYearRangeMatcher,
    getDirectorsForMatch,
  );
  if (matchFromTitleResultsUs) return matchFromTitleResultsUs;

  const looserMatchFromTitleResultsUs = await getMatchFromSearchResults(
    movie,
    searchResultsTitleUs,
    broadYearRangeMatcher,
    getDirectorsForMatch,
  );
  if (looserMatchFromTitleResultsUs) return looserMatchFromTitleResultsUs;

  // Then search using the title
  const searchResultsTitle = await getSearchResults(movie.title);

  const matchFromTitleResults = await getMatchFromSearchResults(
    movie,
    searchResultsTitle,
    narrowYearRangeMatcher,
    getDirectorsForMatch,
  );
  if (matchFromTitleResults) return matchFromTitleResults;

  const looserMatchFromTitleResults = await getMatchFromSearchResults(
    movie,
    searchResultsTitle,
    broadYearRangeMatcher,
    getDirectorsForMatch,
  );
  if (looserMatchFromTitleResults) return looserMatchFromTitleResults;

  // Then seaech without year
  const closeMatchFromTitleResultsUs = await getMatchFromSearchResults(
    movie,
    searchResultsTitleUs,
    noYearRangeMatcher,
    getDirectorsForMatch,
  );
  if (closeMatchFromTitleResultsUs) return closeMatchFromTitleResultsUs;

  const closeMatchFromTitleResults = await getMatchFromSearchResults(
    movie,
    searchResultsTitle,
    noYearRangeMatcher,
    getDirectorsForMatch,
  );
  if (closeMatchFromTitleResults) return closeMatchFromTitleResults;
};

async function findSourceMatch(
  {
    title,
    original_title: originalTitle,
    alternative_titles: alternativeTitles,
    release_date: releaseDate,
    credits,
  },
  { getMatch, getSearchResults, getDirectorsForMatch, getScore },
) {
  const americanTitleDetails = alternativeTitles?.titles?.find(
    ({ iso_3166_1: country }) => basicNormalize(country) === "us",
  );
  const americanTitle = americanTitleDetails?.title ?? title;
  const year = releaseDate.split("-")[0];
  const match = await getMatch(
    {
      title,
      originalTitle,
      americanTitle,
      year,
      credits,
    },
    getSearchResults,
    getDirectorsForMatch,
  );
  if (!match) return undefined;

  const score = await getScore(match);
  if (!score) return undefined;

  return score;
}

module.exports = {
  getNameOptions,
  getDirectors,
  getMatchFromSearchResults,
  narrowYearRangeMatcher,
  broadYearRangeMatcher,
  normaliseAndParseInt,
  getMatch,
  findSourceMatch,
};
