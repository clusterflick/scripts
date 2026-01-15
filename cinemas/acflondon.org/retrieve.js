const cheerio = require("cheerio");
const { fetchText } = require("../../common/utils");
const { url, domain } = require("./attributes");

async function retrieve() {
  const movieListPage = await fetchText(url);

  const $ = cheerio.load(movieListPage);

  const moviePageUrls = new Set();
  $(".event-wrapper .event-title a").each(function () {
    const href = $(this).attr("href");
    moviePageUrls.add(`${domain}${href}`);
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
