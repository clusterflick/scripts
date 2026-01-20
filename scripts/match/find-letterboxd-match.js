const cheerio = require("cheerio");
const { normaliseAndParseInt } = require("./common");
const getPageWithPlaywright = require("../../common/get-page-with-playwright");

const getMovieRatings = async (match) => {
  const url = `https://letterboxd.com/tmdb/${match.id}`;
  const cacheKey = `letterboxd-listing-${match.id}`;

  return await getPageWithPlaywright(url, cacheKey, async (page) => {
    await page.waitForLoadState();
    await page.locator("#film-page-wrapper").waitFor({ strict: false });

    const letterboxdUrl = await page
      .locator('[property="og:url"]')
      .getAttribute("content");

    const ratings = await page
      .locator("section.ratings-histogram-chart")
      .evaluate((el) => el.outerHTML);
    const stats = await page
      .locator("div.production-statistic-list")
      .evaluate((el) => el.outerHTML);

    return { url: letterboxdUrl, ratings, stats };
  });
};

const getScore = async (match) => {
  const { url, ratings, stats } = await getMovieRatings(match);
  const $rating = cheerio.load(ratings);
  const ratingSummary = $rating(".average-rating a").data("original-title");
  const ratingDetails = ratingSummary
    ? ratingSummary.toLowerCase().match(/weighted average of ([^\s]+) based/i)
    : null;

  const $stats = cheerio.load(stats);
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
    $histogramBars.map((i, el) => $rating(el).data("original-title")),
  ).map((value) => normaliseAndParseInt(value.split(" ")[0]));
  const reviewCount = histogram.reduce((sum, val) => sum + val, 0);
  const allStars = histogram.reduce((sum, val, i) => sum + val * (i + 1), 0);
  const unweightedAverage = allStars / reviewCount / 2;

  return {
    id: match.id,
    url,
    likes: likeDetails ? normaliseAndParseInt(likeDetails[1]) : undefined,
    reviews: reviewCount,
    rating: weightedAverage,
    unweightedRating: Math.round(unweightedAverage * 100) / 100,
  };
};

async function findLetterboxdMatch(movie) {
  return getScore(movie);
}

module.exports = findLetterboxdMatch;
