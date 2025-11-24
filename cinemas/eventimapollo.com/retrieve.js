const { fetchText } = require("../../common/utils");
const { domain, url } = require("./attributes");
const cheerio = require("cheerio");

async function retrieve() {
  const movieListPage = await fetchText(url);
  const $ = cheerio.load(movieListPage);

  const filmEvents = [];
  $("[data-search-text]").each((_, element) => {
    const searchText = $(element).attr("data-search-text");
    if (searchText && searchText.toLowerCase().includes("film")) {
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
