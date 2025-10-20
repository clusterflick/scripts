const slugify = require("slugify");
const cheerio = require("cheerio");
const { dailyCache } = require("../../common/cache");
const { fetchText, getText } = require("../../common/utils");
const { normaliseAndParseInt, getMatch, findSourceMatch } = require("./common");

const getSearchResults = async (term) => {
  const slug = slugify(term, { strict: true }).toLowerCase();
  const cacheKey = `letterboxd-search-${slug}`;
  const letterboxdSearch = await dailyCache(cacheKey, async () =>
    fetchText(`https://letterboxd.com/s/search/films/${slug}/`),
  );

  const $ = cheerio.load(letterboxdSearch);
  return $(".search-result")
    .map((i, el) => {
      const $meta = $(el).find("div[data-film-id]");
      const $title = $(el).find(".film-title-wrapper > a");
      const $year = $(el).find(".film-title-wrapper > small.metadata");
      const $director = $(el).find("p.film-metadata > .text-slug");
      return {
        id: $meta.attr("data-film-id"),
        slug: $meta.attr("data-item-slug"),
        // Replace hyphen with dash so that normalization doesn't strip out
        // important information.
        title: getText($title).replaceAll(" - ", " – "),
        url: `https://letterboxd.com${$title.attr("href")}`,
        year: getText($year),
        directors: [getText($director)],
      };
    })
    .get();
};

const getMovieRatings = async (match) => {
  const cacheKey = `letterboxd-ratings-${match.id}-${match.slug}`;
  return await dailyCache(cacheKey, async () =>
    fetchText(`https://letterboxd.com/csi/film/${match.slug}/ratings-summary/`),
  );
};

const getMovieStats = async (match) => {
  const cacheKey = `letterboxd-stats-${match.id}-${match.slug}`;
  return await dailyCache(cacheKey, async () =>
    fetchText(`https://letterboxd.com/csi/film/${match.slug}/stats/`),
  );
};

const getDirectorsForMatch = ({ directors }) => directors;

const getScore = async (match) => {
  const letterboxdRating = await getMovieRatings(match);
  const $rating = cheerio.load(letterboxdRating);
  const ratingSummary = $rating(".average-rating a").attr("title");
  const ratingDetails = ratingSummary
    ? ratingSummary.toLowerCase().match(/weighted average of ([^\s]+) based/i)
    : null;

  const letterboxdStats = await getMovieStats(match);
  const $stats = cheerio.load(letterboxdStats);
  const likeSummary = $stats(".production-statistic.-likes").attr("aria-label");
  const likeDetails = likeSummary
    ? likeSummary.toLowerCase().match(/liked by\s+([\d,]+)\s+member/i)
    : null;

  const weightedAverage = ratingDetails
    ? parseFloat(ratingDetails[1])
    : undefined;

  // Calculate unweighted average
  const $histogramBars = $rating(".rating-histogram-bar a");
  const histogram = Array.from(
    $histogramBars.map((i, el) => $rating(el).attr("title")),
  ).map((value) => normaliseAndParseInt(value.split(" ")[0]));
  const reviewCount = histogram.reduce((sum, val) => sum + val, 0);
  const allStars = histogram.reduce((sum, val, i) => sum + val * (i + 1), 0);
  const unweightedAverage = allStars / reviewCount / 2;

  return {
    id: match.id,
    url: `https://letterboxd.com/film/${match.slug}/`,
    likes: likeDetails ? normaliseAndParseInt(likeDetails[1]) : undefined,
    reviews: reviewCount,
    rating: weightedAverage,
    unweightedRating: Math.round(unweightedAverage * 100) / 100,
  };
};

async function findLetterboxdMatch(movie) {
  return findSourceMatch(movie, {
    getMatch,
    getSearchResults,
    getDirectorsForMatch,
    getScore,
  });
}

module.exports = findLetterboxdMatch;
