const cheerio = require("cheerio");
const { fetchWin1252Text } = require("../../common/utils");
const { domain, cinemaId } = require("./attributes");

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
  const movieListPage = await fetchWin1252Text(cinemaUrl);

  const movieUrls = extractMovieUrls(movieListPage);
  const moviePages = {};
  for (const movieUrl of movieUrls) {
    moviePages[movieUrl] = await fetchWin1252Text(movieUrl);
  }

  return {
    movieListPage,
    moviePages,
  };
}

module.exports = retrieve;
