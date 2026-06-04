const cheerio = require("cheerio");
const { fetchText, assertSelector } = require("../utils");

async function retrieve(attributes) {
  const { url, domain } = attributes;

  const movieListPage = await fetchText(url);
  assertSelector(movieListPage, "#first-tab");
  const $ = cheerio.load(movieListPage);
  const moviePageUrls = $("#first-tab > div > a")
    .map((i, el) => `${domain}${$(el).attr("href")}`)
    .get();
  const moviePages = {};
  for (const moviePageUrl of moviePageUrls) {
    moviePages[moviePageUrl] = await fetchText(moviePageUrl);
  }

  return { movieListPage, moviePages };
}

module.exports = retrieve;
