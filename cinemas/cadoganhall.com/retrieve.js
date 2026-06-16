const cheerio = require("cheerio");
const { fetchText, assertSelector } = require("../../common/utils");
const { url } = require("./attributes");

async function retrieve() {
  const movieListPage = await fetchText(url);
  assertSelector(movieListPage, ".c-event-item__link-wrap");
  const $ = cheerio.load(movieListPage);

  const moviePageUrls = new Set();
  $(".c-event-item__link-wrap").each(function () {
    moviePageUrls.add($(this).attr("href"));
  });

  const moviePages = {};
  for (const moviePageUrl of [...moviePageUrls]) {
    moviePages[moviePageUrl] = await fetchText(moviePageUrl);
  }

  return { movieListPage, moviePages };
}

module.exports = retrieve;
