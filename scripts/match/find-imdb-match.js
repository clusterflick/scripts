const cheerio = require("cheerio");
const { dailyCache } = require("../../common/cache");
const { getText, fetchText } = require("../../common/utils");

const getAppDataFrom = (contents) => {
  const $ = cheerio.load(contents);
  return JSON.parse(getText($("#__NEXT_DATA__")));
};

const getMoviePage = async (id, urlBase) => {
  const cacheKey = `imdb-get-${id}`;
  const url = `${urlBase}/ratings`;
  return await dailyCache(cacheKey, async () => {
    const contents = await fetchText(url);
    const appData = getAppDataFrom(contents);
    // Check for an error page and fail if we find one
    const { error } = appData.props.pageProps;
    if (error) {
      throw new Error(`Request failed: ${error.message}`);
    }
    return contents;
  });
};

const getScore = async (id) => {
  const url = `https://www.imdb.com/title/${id}`;
  const imdbGet = await getMoviePage(id, url);
  const appData = getAppDataFrom(imdbGet);
  const { entityMetadata, histogramData } = appData.props.pageProps.contentData;
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
