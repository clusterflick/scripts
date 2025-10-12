const cheerio = require("cheerio");
const { fetchText } = require("../../common/utils");
const { url, domain } = require("./attributes");

async function retrieve() {
  const movieListPage = await fetchText(url);

  const $ = cheerio.load(movieListPage);

  const moviePageUrls = new Set();
  $(".item.films").each(function () {
    const url = $(this).children("a").attr("href");
    moviePageUrls.add(`${domain}${url}`);
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
