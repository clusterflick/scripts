const cheerio = require("cheerio");
const attributes = require("./attributes");
const { fetchText } = require("../../common/utils");

async function retrieve() {
  const movieListPage = await fetchText(attributes.url);

  const $ = cheerio.load(movieListPage);

  const moviePageUrls = new Set();
  $(".films-list__by-title__film-title a").each(function () {
    moviePageUrls.add($(this).attr("href"));
  });

  const moviePages = [];
  for (moviePageUrl of moviePageUrls) {
    moviePages.push(await fetchText(moviePageUrl));
  }

  return {
    movieListPage,
    moviePages,
  };
}

module.exports = retrieve;
