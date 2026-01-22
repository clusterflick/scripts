const zlib = require("node:zlib");
const { promisify } = require("node:util");
const { dailyCache } = require("../../common/cache");

const gunzip = promisify(zlib.gunzip);

const IMDB_RATINGS_URL = "https://datasets.imdbws.com/title.ratings.tsv.gz";
const CACHE_KEY = "imdb-ratings-dataset";

let ratingsMap = null;

const downloadAndParseRatings = async () => {
  const response = await fetch(IMDB_RATINGS_URL);
  if (!response.ok) {
    throw new Error(`Failed to download IMDB dataset: ${response.statusText}`);
  }

  const compressedData = Buffer.from(await response.arrayBuffer());
  const decompressedData = await gunzip(compressedData);
  const tsvContent = decompressedData.toString("utf-8");

  // Parse TSV: tconst, averageRating, numVotes
  const lines = tsvContent.trim().split("\n");
  const ratings = {};

  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const [tconst, averageRating, numVotes] = lines[i].split("\t");
    ratings[tconst] = {
      rating: parseFloat(averageRating),
      reviews: parseInt(numVotes, 10),
    };
  }

  return ratings;
};

const getRatingsMap = async () => {
  if (ratingsMap) return ratingsMap;

  ratingsMap = await dailyCache(CACHE_KEY, downloadAndParseRatings);
  return ratingsMap;
};

async function findImdbMatch({ imdbId }) {
  if (!imdbId) return undefined;

  const ratings = await getRatingsMap();
  const data = ratings[imdbId];

  if (!data) return undefined;

  return {
    id: imdbId,
    url: `https://www.imdb.com/title/${imdbId}`,
    reviews: data.reviews,
    rating: data.rating,
  };
}

module.exports = findImdbMatch;
