const cheerio = require("cheerio");
const { fetchText, assertSelector } = require("../utils");

async function retrieve(attributes) {
  const { url } = attributes;

  const movieListPage = await fetchText(url);
  assertSelector(movieListPage, ".card-list");
  const $ = cheerio.load(movieListPage);

  const moviePageUrls = new Set();
  $(".card-list .card a").each(function () {
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
