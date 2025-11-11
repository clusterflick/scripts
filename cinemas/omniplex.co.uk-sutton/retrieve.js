const cheerio = require("cheerio");
const { domain, cinemaId } = require("./attributes");

const fetchText = async (url) => {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const decoder = new TextDecoder("iso-8859-1");
  return decoder.decode(buffer);
};

function fixHtmlTypos(html) {
  return html.replace(/<soan /g, "<span ");
}

function extractMovieUrls(html) {
  const correctedHtml = fixHtmlTypos(html);
  const $ = cheerio.load(correctedHtml);

  const movieUrls = new Set();
  $(".OMP_eventWrapper .OMP_infoSection a").each((i, el) => {
    const href = $(el).attr("href");
    const fullUrl = href.startsWith("http") ? href : `${domain}${href}`;
    movieUrls.add(fullUrl);
  });

  return Array.from(movieUrls);
}

async function retrieve() {
  const cinemaUrl = `${domain}/cinema/${cinemaId}`;
  const movieListPage = await fetchText(cinemaUrl);

  const movieUrls = extractMovieUrls(movieListPage);
  const moviePages = {};
  for (const movieUrl of movieUrls) {
    moviePages[movieUrl] = await fetchText(movieUrl);
  }

  return {
    movieListPage,
    moviePages,
  };
}

module.exports = retrieve;
