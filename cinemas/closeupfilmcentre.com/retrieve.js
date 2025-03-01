const cheerio = require("cheerio");
const { fetchText } = require("../../common/utils");
const { domain } = require("./attributes");

async function retrieve() {
  const movieListPageUrl = `${domain}/search_film_programmes/`;
  const movieListPage = await fetchText(movieListPageUrl);

  const $ = cheerio.load(movieListPage);

  const moviePageUrls = new Set();
  $(".inner_block_3 a").each(function () {
    const url = $(this).attr("href");
    moviePageUrls.add(url);
  });

  const moviePages = {};
  for (const moviePageUrl of [...moviePageUrls]) {
    moviePages[moviePageUrl] = await fetchText(moviePageUrl);
  }

  return {
    movieListPage,
    moviePages,
  };
}

module.exports = retrieve;
