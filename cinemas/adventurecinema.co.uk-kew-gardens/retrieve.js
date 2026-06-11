const cheerio = require("cheerio");
const { fetchText, assertSelector } = require("../../common/utils");
const { url } = require("./attributes");

async function retrieve() {
  const movieListPage = await fetchText(url);
  assertSelector(movieListPage, ".upcomingEvents a[href*='/event/']");

  const $ = cheerio.load(movieListPage);
  const eventUrls = new Set();
  $(".upcomingEvents a[href*='/event/']").each(function () {
    eventUrls.add($(this).attr("href"));
  });

  const moviePages = {};
  for (const eventUrl of [...eventUrls]) {
    moviePages[eventUrl] = await fetchText(eventUrl);
  }

  return { movieListPage, moviePages };
}

module.exports = retrieve;
