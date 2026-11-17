const cheerio = require("cheerio");
const { fetchText, assertSelector, getListingLinks } = require("../utils");

async function retrieve(attributes) {
  const { url } = attributes;

  const movieListPage = await fetchText(url);
  assertSelector(movieListPage, ".card-list");
  const $ = cheerio.load(movieListPage);

  const moviePageUrls = new Set(getListingLinks($, $(".card-list .card"), "a"));

  const moviePages = {};
  for (const moviePageUrl of moviePageUrls) {
    const fullUrl = moviePageUrl.startsWith("http")
      ? moviePageUrl
      : `${attributes.domain}${moviePageUrl}`;
    moviePages[fullUrl] = await fetchText(fullUrl);
  }

  return { movieListPage, moviePages };
}

module.exports = retrieve;
