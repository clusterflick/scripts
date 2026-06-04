const cheerio = require("cheerio");
const attributes = require("./attributes");
const { fetchText, assertSelector } = require("../../common/utils");

async function retrieve() {
  const movieListPage = await fetchText(attributes.url);
  assertSelector(
    movieListPage,
    ".films-list__by-title__film-title, .films-list__by-date__film__title",
  );
  const $ = cheerio.load(movieListPage);

  const moviePageUrls = new Set();
  $(
    ".films-list__by-title__film-title a, .films-list__by-date__film__title a",
  ).each(function () {
    moviePageUrls.add($(this).attr("href"));
  });

  const moviePages = [];
  for (const moviePageUrl of moviePageUrls) {
    moviePages.push(await fetchText(moviePageUrl));
  }

  return {
    movieListPage,
    moviePages,
  };
}

module.exports = retrieve;
