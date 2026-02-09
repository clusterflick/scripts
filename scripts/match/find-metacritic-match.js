const slugify = require("slugify");
const { dailyCache } = require("../../common/cache");
const { fetchJson } = require("../../common/utils");
const { getMatch, findSourceMatch } = require("./common");

const getImdbIdFromPoster = (filename) => {
  const imdbIdMatch = filename?.match(/5-(tt\d+)\.jpg/i);
  if (!imdbIdMatch) return;
  return imdbIdMatch[1];
};

const getSearchResults = async (term) => {
  const slug = slugify(term, { strict: true }).toLowerCase();
  const cacheKey = `metacritic-search-${slug}`;
  const metacriticSearch = await dailyCache(cacheKey, async () =>
    fetchJson(
      `https://backend.metacritic.com/finder/metacritic/search/${slug}/web?mcoTypeId=2&offset=0&limit=30`,
    ),
  );

  if (!metacriticSearch.data?.items) {
    return [];
  }

  return metacriticSearch.data.items.map(
    ({ id, slug, title, releaseDate, images }) => {
      const imdbId = getImdbIdFromPoster(images[0]?.filename);
      return {
        id,
        slug,
        // Replace hyphen with dash so that normalization doesn't strip out
        // important information.
        title: title.replaceAll(" - ", " – "),
        year: releaseDate.split("-")[0],
        imdbId,
      };
    },
  );
};

const getMoviePage = async (match) => {
  const cacheKey = `metacritic-get-${match.slug}-${match.id}`;
  return await dailyCache(cacheKey, async () =>
    fetchJson(
      `https://backend.metacritic.com/movies/metacritic/${match.slug}/web`,
    ),
  );
};

const getUserReview = async (match) => {
  const cacheKey = `metacritic-user-review-${match.slug}-${match.id}`;
  return await dailyCache(cacheKey, async () =>
    fetchJson(
      `https://backend.metacritic.com/reviews/metacritic/user/movies/${match.slug}/stats/web`,
    ),
  );
};

const getDirectorsForMatch = async (match) => {
  const matchPage = await getMoviePage(match);
  return matchPage.data.item.production.crew
    .filter(({ roleTypeGroupId, name }) => roleTypeGroupId === 1 && name) // Director
    .map(({ name }) => name);
};

const getScoresFor = (group) =>
  group
    ? {
        likes: group.positiveCount,
        dislikes: group.negativeCount,
        reviews: group.reviewCount,
        rating: group.score,
      }
    : undefined;

const getScore = async (match) => {
  const metacriticGet = await getMoviePage(match);
  const userReview = await getUserReview(match);
  return {
    id: metacriticGet.data.item.id,
    url: `https://www.metacritic.com/movie/${match.slug}`,
    audience: getScoresFor(userReview.data.item),
    critics: getScoresFor(metacriticGet.data.item.criticScoreSummary),
  };
};

async function findMetacriticMatch(movie) {
  return findSourceMatch(movie, {
    getMatch,
    getSearchResults,
    getDirectorsForMatch,
    getScore,
  });
}

module.exports = findMetacriticMatch;
