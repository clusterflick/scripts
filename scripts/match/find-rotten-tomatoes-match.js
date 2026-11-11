const cheerio = require("cheerio");
const { dailyCache } = require("../../common/cache");
const {
  fetchText,
  getText,
  getId,
  getSearchSlug,
} = require("../../common/utils");
const {
  narrowYearRangeMatcher,
  broadYearRangeMatcher,
  getMatchFromSearchResults,
  getDirectors,
  getMatch,
  findSourceMatch,
} = require("./common");

const getSearchResults = async (term) => {
  const cacheKey = `rotten-tomatoes-search-${getSearchSlug(term)}`;
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
        year: $(el).attr("release-year"),
      };
    })
    .get();
};

const getMoviePage = async (match) => {
  const cacheKey = `rotten-tomatoes-get-${getId(match.url)}`;
  return await dailyCache(cacheKey, async () => fetchText(match.url));
};

const getDirectorsForMatch = async (match) => {
  let matchPage;
  try {
    matchPage = await getMoviePage(match);
  } catch {
    return [];
  }
  const $matchPage = cheerio.load(matchPage);
  const $directorRoles = $matchPage(
    [
      ".cast-and-crew p[class='role']:contains('Director')",
      ".cast-and-crew p[class='role']:contains('Narrator')",
    ].join(","),
  );
  return $directorRoles.map((i, el) => getText($matchPage(el).prev())).get();
};

const getRottenTomatoesMatch = async (movie) => {
  // Search first using the director, if available
  const director = getDirectors(movie.credits)[0];
  if (director) {
    const searchResultsDirector = await getSearchResults(director);

    const matchFromDirectorResults = await getMatchFromSearchResults(
      movie,
      searchResultsDirector,
      narrowYearRangeMatcher,
      getDirectorsForMatch,
    );
    if (matchFromDirectorResults) return matchFromDirectorResults;

    const looserMatchFromDirectorResults = await getMatchFromSearchResults(
      movie,
      searchResultsDirector,
      broadYearRangeMatcher,
      getDirectorsForMatch,
    );
    if (looserMatchFromDirectorResults) return looserMatchFromDirectorResults;
  }

  return getMatch(movie, getSearchResults, getDirectorsForMatch);
};

// The scorecard gives the Tomatometer and Popcornmeter as `scorePercent`
// ("100%"). It used to be a bare `score`, and when RT renamed it in November
// 2026 every film's score read as missing without anything failing, so a value
// that is present but not a percentage throws rather than parsing to NaN.
const parseScorePercent = (scorePercent) => {
  if (scorePercent === undefined) return undefined;
  const match = /^(\d{1,3})%$/.exec(scorePercent);
  if (!match) {
    throw new Error(`Unrecognised Rotten Tomatoes score "${scorePercent}"`);
  }
  return parseInt(match[1], 10);
};

const getScoresFor = (group) =>
  group
    ? {
        likes: group.likedCount,
        dislikes: group.notLikedCount,
        reviews: group.reviewCount,
        rating: parseFloat(group.averageRating),
        score: parseScorePercent(group.scorePercent),
      }
    : undefined;

const parseMoviePage = (moviePage, url) => {
  const $ = cheerio.load(moviePage);
  const id = $("watchlist-button").attr("ems-id");
  const scorecard = JSON.parse(getText($("#media-scorecard-json")));
  return {
    id,
    url,
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

const getScore = async (match) =>
  parseMoviePage(await getMoviePage(match), match.url);

async function findRottenTomatoesMatch(movie) {
  return findSourceMatch(movie, {
    getMatch: getRottenTomatoesMatch,
    getSearchResults,
    getDirectorsForMatch,
    getScore,
  });
}

module.exports = findRottenTomatoesMatch;
module.exports.parseMoviePage = parseMoviePage;
