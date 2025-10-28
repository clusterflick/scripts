const { fetchText } = require("../../common/utils.js");
const cheerio = require("cheerio");
const attributes = require("./attributes");

async function retrieve() {
  const movieListPage = await fetchText(attributes.url);

  const $ = cheerio.load(movieListPage);
  const filmUrls = $("#eventscontent a")
    .map((i, elem) => `${attributes.domain}${$(elem).attr("href")}`)
    .get();

  const moviePages = {};
  for (const url of filmUrls) {
    const html = await fetchText(url);
    moviePages[url] = html;
  }

  return { movieListPage, moviePages };
}

module.exports = retrieve;
