const cheerio = require("cheerio");
const { fetchText, assertSelector } = require("../../common/utils");
const { url } = require("./attributes");

async function retrieve() {
  const movieListPage = await fetchText(url);
  assertSelector(movieListPage, ".event-summary");
  const $ = cheerio.load(movieListPage);

  const moviePageUrls = new Set();
  $(".event-summary").each(function () {
    if (!$(this).text().includes("Catch a movie")) return;

    const href = $(this).closest("a").attr("href");
    if (href) moviePageUrls.add(href);
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
