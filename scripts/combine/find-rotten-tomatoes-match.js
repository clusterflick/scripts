const slugify = require("slugify");
const cheerio = require("cheerio");
const { dailyCache } = require("../../common/cache");
const {
  fetchText,
  getText,
  basicNormalize,
  compareAsSimilar,
  getId,
} = require("../../common/utils");
const normalizeTitle = require("../../common/normalize-title");
const normalizeName = require("../../common/normalize-name");

const getSearchResults = async (term) => {
  const slug = slugify(term, { strict: true }).toLowerCase();
  const cacheKey = `rotten-tomatoes-search-${slug}`;
  const rottenTomatoesSearch = await dailyCache(cacheKey, async () =>
    fetchText(
      `https://www.rottentomatoes.com/search?search=${encodeURIComponent(term)}`,
    ),
  );

  const $ = cheerio.load(rottenTomatoesSearch);
  return $("search-page-result")
    .find("search-page-media-row")
    .map((i, el) => {
      const $title = $(el).find("[data-qa='info-name']");
      return {
        // Replace hyphen with dash so that normalization doesn't strip out
        // important information.
        title: getText($title).replaceAll(" - ", " – "),
        url: $title.attr("href"),
        year: $(el).attr("releaseyear"),
      };
    })
    .get();
};

const getMoviePage = async (match) => {
  const cacheKey = `rotten-tomatoes-get-${getId(match.url)}`;
  return await dailyCache(cacheKey, async () => fetchText(match.url));
};

const getDirectorsForMatch = async (match) => {
  const matchPage = await getMoviePage(match);
  const $matchPage = cheerio.load(matchPage);
  const $directorRoles = $matchPage(
    [
      ".cast-and-crew p[class='role']:contains('Director')",
      ".cast-and-crew p[class='role']:contains('Narrator')",
    ].join(","),
  );
  return $directorRoles.map((i, el) => getText($matchPage(el).prev())).get();
};

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

const getMatchFromSearchResults = async (movie, searchResults, matcher) => {
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

const getMatch = async (movie) => {
  // Search first using the director, if available
  const director = getDirectors(movie.credits)[0];
  if (director) {
    const searchResultsDirector = await getSearchResults(director);

    const matchFromDirectorResults = await getMatchFromSearchResults(
      movie,
      searchResultsDirector,
      narrowYearRangeMatcher,
    );
    if (matchFromDirectorResults) return matchFromDirectorResults;

    const looserMatchFromDirectorResults = await getMatchFromSearchResults(
      movie,
      searchResultsDirector,
      broadYearRangeMatcher,
    );
    if (looserMatchFromDirectorResults) return looserMatchFromDirectorResults;
  }

  // Then search using the US title
  const searchResultsTitleUs = await getSearchResults(movie.americanTitle);

  const matchFromTitleResultsUs = await getMatchFromSearchResults(
    movie,
    searchResultsTitleUs,
    narrowYearRangeMatcher,
  );
  if (matchFromTitleResultsUs) return matchFromTitleResultsUs;

  const looserMatchFromTitleResultsUs = await getMatchFromSearchResults(
    movie,
    searchResultsTitleUs,
    broadYearRangeMatcher,
  );
  if (looserMatchFromTitleResultsUs) return looserMatchFromTitleResultsUs;

  // Then search using the title
  const searchResultsTitle = await getSearchResults(movie.title);

  const matchFromTitleResults = await getMatchFromSearchResults(
    movie,
    searchResultsTitle,
    narrowYearRangeMatcher,
  );
  if (matchFromTitleResults) return matchFromTitleResults;

  const looserMatchFromTitleResults = await getMatchFromSearchResults(
    movie,
    searchResultsTitle,
    broadYearRangeMatcher,
  );
  if (looserMatchFromTitleResults) return looserMatchFromTitleResults;
};

const getScoresFor = (group) =>
  group
    ? {
        likes: group.likedCount,
        dislikes: group.notLikedCount,
        reviews: group.reviewCount,
        rating: group.averageRating,
        score: group.score,
      }
    : undefined;

const getScore = async (match) => {
  const rottenTomatoesGet = await getMoviePage(match);
  const $ = cheerio.load(rottenTomatoesGet);
  const scorecard = JSON.parse(getText($("#media-scorecard-json")));
  return {
    url: match.url,
    audience: {
      all: getScoresFor(scorecard.overlay.audienceAll),
      verified: getScoresFor(scorecard.overlay.audienceVerified),
    },
    critics: {
      all: getScoresFor(scorecard.overlay.criticsAll),
      top: getScoresFor(scorecard.overlay.criticsTop),
    },
  };
};

async function findRottenTomatoesMatch({
  title,
  original_title: originalTitle,
  alternative_titles: alternativeTitles,
  release_date: releaseDate,
  credits,
}) {
  const americanTitleDetails = alternativeTitles?.titles?.find(
    ({ iso_3166_1: country }) => basicNormalize(country) === "us",
  );
  const americanTitle = americanTitleDetails?.title ?? title;
  const year = releaseDate.split("-")[0];
  const match = await getMatch({
    title,
    originalTitle,
    americanTitle,
    year,
    credits,
  });
  if (!match) return undefined;

  const score = await getScore(match);
  if (!score) return undefined;

  return score;
}

module.exports = findRottenTomatoesMatch;
