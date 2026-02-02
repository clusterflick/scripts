const cheerio = require("cheerio");
const { fetchText } = require("../../common/utils");
const { url, domain } = require("./attributes");

async function retrieve() {
  const movieListPage = await fetchText(url);

  const $ = cheerio.load(movieListPage);

  // Extract film event URLs from the listing page
  const moviePageUrls = new Set();
  $(".event-card").each(function () {
    const href = $(this).find(".event-card__content h3 a").attr("href");
    if (href) {
      const fullUrl = href.startsWith("http") ? href : `${domain}${href}`;
      moviePageUrls.add(fullUrl);
    }
  });

  const moviePages = {};
  for (const moviePageUrl of [...moviePageUrls]) {
    const moviePage = await fetchText(moviePageUrl);
    moviePages[moviePageUrl] = moviePage;
  }

  return {
    movieListPage,
    moviePages,
  };
}

module.exports = retrieve;
