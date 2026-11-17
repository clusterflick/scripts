const cheerio = require("cheerio");
const {
  fetchText,
  assertSelector,
  getListingLinks,
} = require("../../common/utils");
const { url } = require("./attributes");

async function retrieve() {
  const movieListPage = await fetchText(url);
  assertSelector(movieListPage, ".upcoming");
  const $ = cheerio.load(movieListPage);

  // Extract upcoming event URLs from the listing page
  const moviePageUrls = new Set(
    getListingLinks($, $(".upcoming .mediaBlock"), ".category_name a"),
  );

  const moviePages = {};
  for (const moviePageUrl of [...moviePageUrls]) {
    const moviePage = await fetchText(moviePageUrl);
    moviePages[moviePageUrl] = moviePage;
  }

  return {
    movieListPage,
    moviePages,
  };
}

module.exports = retrieve;
