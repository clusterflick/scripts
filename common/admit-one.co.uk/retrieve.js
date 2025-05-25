const cheerio = require("cheerio");

const fetchText = async (url) => {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const decoder = new TextDecoder("iso-8859-1");
  return decoder.decode(buffer);
};

async function retrieve({ domain }) {
  const movieListPage = await fetchText(domain);
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
    moviePages[moviePageUrl] = await fetchText(moviePageUrl);
  }

  return {
    movieListPage,
    moviePages,
  };
}

module.exports = retrieve;
