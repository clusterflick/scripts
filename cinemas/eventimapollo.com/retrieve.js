const { fetchText, assertSelector } = require("../../common/utils");
const { domain, url } = require("./attributes");
const cheerio = require("cheerio");
const { isFilmEntry } = require("./utils");

async function retrieve() {
  const movieListPage = await fetchText(url);
  assertSelector(movieListPage, "[data-search-text]");
  const $ = cheerio.load(movieListPage);

  const filmEvents = [];
  $("[data-search-text]").each((_, element) => {
    if (isFilmEntry($(element))) {
      const coverLink = $(element).find("a.cover-link");
      filmEvents.push(`${domain}${coverLink.attr("href")}`);
    }
  });

  const moviePages = {};
  for (const eventUrl of filmEvents) {
    moviePages[eventUrl] = await fetchText(eventUrl);
  }

  return { movieListPage, moviePages };
}

module.exports = retrieve;
