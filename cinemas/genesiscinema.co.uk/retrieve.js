const cheerio = require("cheerio");
const { domain } = require("./attributes");

const fetchText = async (url) => {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const decoder = new TextDecoder("iso-8859-1");
  return decoder.decode(buffer);
};

async function retrieve() {
  const movieListPageUrl = `${domain}/whatson`;
  const movieListPage = await fetchText(movieListPageUrl);

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
  for (moviePageUrl of [...moviePageUrls]) {
    moviePages[moviePageUrl] = await fetchText(moviePageUrl);
  }

  return {
    movieListPage,
    moviePages,
  };
}

module.exports = retrieve;
