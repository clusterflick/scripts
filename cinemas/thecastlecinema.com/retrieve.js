const cheerio = require("cheerio");
const { fetchText } = require("../../common/utils");
const { domain } = require("./attributes");

async function retrieve() {
  const movieListPageUrl = `${domain}/calendar/`;
  const movieListPage = await fetchText(movieListPageUrl);

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
