const cheerio = require("cheerio");
const { fetchText } = require("../../common/utils");
const { domain } = require("./attributes");

async function retrieve() {
  const movieListPageUrl = `${domain}/whats-on/?type=72&period=any#/`;
  const movieListPage = await fetchText(movieListPageUrl);

  const $ = cheerio.load(movieListPage);

  const moviePageUrls = new Set();
  $("article.card--film").each(function () {
    const url = $(this).find(".card__content > a").attr("href");
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
