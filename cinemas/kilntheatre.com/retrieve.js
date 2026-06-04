const cheerio = require("cheerio");
const { fetchText, assertSelector } = require("../../common/utils");
const { url } = require("./attributes");

async function retrieve() {
  const movieListPage = await fetchText(url);
  assertSelector(movieListPage, ".c-film-listing");
  const $ = cheerio.load(movieListPage);

  const moviePageUrls = $(".c-film-listing a")
    .map((i, element) => $(element).attr("href"))
    .get();

  const moviePages = {};
  for (const moviePageUrl of [...new Set(moviePageUrls)]) {
    moviePages[moviePageUrl] = await fetchText(moviePageUrl);
  }

  return { movieListPage, moviePages };
}

module.exports = retrieve;
