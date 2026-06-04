const cheerio = require("cheerio");
const { fetchText, assertSelector } = require("../../common/utils");

async function retrieve({ domain }) {
  const movieListPageUrl = `${domain}/calendar/`;
  const movieListPage = await fetchText(movieListPageUrl);
  assertSelector(movieListPage, ".programme-tile");
  const $ = cheerio.load(movieListPage);

  const moviePageUrls = new Set();
  $(".programme-tile").each(function () {
    const url = `${domain}${$(this).find(".tile-details > a").attr("href")}`;
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
