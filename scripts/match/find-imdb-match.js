const getPageWithPlaywright = require("../../common/get-page-with-playwright");

const getMoviePage = async (id, urlBase) => {
  const cacheKey = `imdb-get-${id}`;
  const url = `${urlBase}/ratings`;
  const contents = await getPageWithPlaywright(url, cacheKey, async (page) => {
    await page.waitForLoadState();

    try {
      const data = await page.locator("#__NEXT_DATA__").textContent();
      const appData = JSON.parse(data);
      // Check for an error page and fail if we find one
      const { error } = appData.props.pageProps;
      if (error) {
        throw new Error(
          `Request failed: ${error.message || error.name || "Error found on page"}`,
        );
      }
      return data;
    } catch {
      throw new Error(`Retrival failed: Unable to parse app data from page`);
    }
  });
  return JSON.parse(contents);
};

const getScore = async (id) => {
  const url = `https://www.imdb.com/title/${id}`;
  const appData = await getMoviePage(id, url);
  const { contentData } = appData.props.pageProps;
  if (!contentData) return;

  const { entityMetadata, histogramData } = contentData;
  const { aggregateRating, voteCount } = entityMetadata.ratingsSummary;
  const allStars = histogramData.histogramValues.reduce(
    (sum, { voteCount: val, rating }) => sum + val * rating,
    0,
  );
  const unweightedAverage = allStars / voteCount;

  return {
    id,
    url,
    reviews: voteCount,
    rating: aggregateRating,
    unweightedRating: Math.round(unweightedAverage * 10) / 10,
  };
};

async function findImdbMatch({ imdbId }) {
  if (!imdbId) return undefined;

  const score = await getScore(imdbId);
  if (!score) return undefined;

  return score;
}

module.exports = findImdbMatch;
