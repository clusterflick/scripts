const cheerio = require("cheerio");
const { fetchText, assertSelector } = require("../../common/utils");
const { domain, url } = require("./attributes");

async function retrieve() {
  const movieListPage = await fetchText(url);
  assertSelector(movieListPage, ".upcoming");
  const $ = cheerio.load(movieListPage);

  const moviePageUrls = $(".upcoming .card-event a")
    .map((i, element) => $(element).attr("href"))
    .get()
    .map((href) => (href.startsWith("http") ? href : `${domain}${href}`));

  const moviePages = {};
  for (const moviePageUrl of [...new Set(moviePageUrls)]) {
    moviePages[moviePageUrl] = await fetchText(moviePageUrl);
  }

  return { movieListPage, moviePages };
}

module.exports = retrieve;
