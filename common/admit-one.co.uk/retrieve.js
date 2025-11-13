const cheerio = require("cheerio");
const { fetchWin1252Text } = require("../utils");

async function retrieve({ domain }) {
  const movieListPage = await fetchWin1252Text(domain);
  const $ = cheerio.load(movieListPage);
  const moviePageUrls = new Set();
  $(".whatson_panel").each(function () {
    $(this)
      .find("> div > div")
      .each(function () {
        const url = `${domain}/${$(this).find("h2 a").attr("href")}`;
        moviePageUrls.add(url);
      });
  });

  const moviePages = {};
  for (const moviePageUrl of [...moviePageUrls]) {
    moviePages[moviePageUrl] = await fetchWin1252Text(moviePageUrl);
  }

  return {
    movieListPage,
    moviePages,
  };
}

module.exports = retrieve;
