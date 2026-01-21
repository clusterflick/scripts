const cheerio = require("cheerio");
const { normaliseAndParseInt } = require("./common");
const getPageWithPlaywright = require("../../common/get-page-with-playwright");
const { basicNormalize } = require("../../common/utils");

const getMovieRatings = async (match) => {
  const url = `https://letterboxd.com/tmdb/${match.id}`;
  const cacheKey = `letterboxd-listing-${match.id}`;

  return await getPageWithPlaywright(
    url,
    cacheKey,
    async (page) => {
      await page.waitForLoadState();

      // Race between the film page loading and the "not imported" page
      const filmWrapper = page.locator("#film-page-wrapper");
      const notImportedTitle = page.locator("#content h1.title");

      await filmWrapper.or(notImportedTitle).waitFor({ state: "attached" });

      // Check if we hit the "not imported" page
      if (await notImportedTitle.isVisible()) {
        const title = await notImportedTitle.textContent();
        if (basicNormalize(title) === basicNormalize("Film not imported")) {
          return { isNotImported: true };
        }
      }

      const letterboxdUrl = await page
        .locator('[property="og:url"]')
        .getAttribute("content");

      let ratings = "";
      try {
        await page
          .locator("section.ratings-histogram-chart")
          .waitFor({ state: "attached", timeout: 10000 });

        ratings = await page
          .locator("section.ratings-histogram-chart")
          .evaluate((el) => el.outerHTML);
      } catch {
        // Assume the movie doesn't have any ratings
      }

      let stats = "";
      try {
        await page
          .locator("div.production-statistic-list .production-statistic")
          .first()
          .waitFor({ state: "attached", timeout: 10000 });

        stats = await page
          .locator("div.production-statistic-list")
          .evaluate((el) => el.outerHTML);
      } catch {
        // Movie should always have stats. Let's not block, but output a warning
        // message so we can see the issue in the logs
        console.log(`\nWARN: Stats not available for movie: ${letterboxdUrl}`);
      }

      return { url: letterboxdUrl, ratings, stats };
    },
    { goto: { waitUntil: "domcontentloaded" } },
  );
};

const getScore = async (match) => {
  const {
    url,
    ratings,
    stats,
    isNotImported = false,
  } = await getMovieRatings(match);
  if (isNotImported) return null;

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
  const score = await getScore(movie);
  return score;
}

module.exports = findLetterboxdMatch;
