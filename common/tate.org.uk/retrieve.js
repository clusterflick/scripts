const cheerio = require("cheerio");
const { fetchText, assertSelector } = require("../utils");
const { LISTING, LISTING_CARD_LINK } = require("./utils");

async function retrieve(attributes) {
  const { url } = attributes;

  const movieListPage = await fetchText(url);
  assertSelector(movieListPage, LISTING);
  const $ = cheerio.load(movieListPage);

  const moviePageUrls = new Set();
  $(LISTING_CARD_LINK).each(function () {
    moviePageUrls.add($(this).attr("href"));
  });

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
