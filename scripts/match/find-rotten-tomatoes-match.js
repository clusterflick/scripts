const slugify = require("slugify");
const cheerio = require("cheerio");
const { dailyCache } = require("../../common/cache");
const { fetchText, getText, getId } = require("../../common/utils");
const {
  narrowYearRangeMatcher,
  broadYearRangeMatcher,
  getMatchFromSearchResults,
  getDirectors,
  getMatch,
  findSourceMatch,
} = require("./common");

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

const getScoresFor = (group) =>
  group
    ? {
        likes: group.likedCount,
        dislikes: group.notLikedCount,
        reviews: group.reviewCount,
        rating: parseFloat(group.averageRating),
        score: parseInt(group.score, 10),
      }
    : undefined;

const getScore = async (match) => {
  const rottenTomatoesGet = await getMoviePage(match);
  const $ = cheerio.load(rottenTomatoesGet);
  const id = $("watchlist-button").attr("ems-id");
  const scorecard = JSON.parse(getText($("#media-scorecard-json")));
  return {
    id,
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

async function findRottenTomatoesMatch(movie) {
  return findSourceMatch(movie, {
    getMatch: getRottenTomatoesMatch,
    getSearchResults,
    getDirectorsForMatch,
    getScore,
  });
}

module.exports = findRottenTomatoesMatch;
