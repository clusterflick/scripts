const cheerio = require("cheerio");
const { fetchText, assertSelector } = require("../../common/utils");
const { url, domain } = require("./attributes");

async function retrieve() {
  // Ibraaz programmes talks, workshops and performances alongside its films,
  // and the Ticket Tailor listings they all share carry nothing but a title -
  // so the site's own film category is what tells us which events are films.
  const movieListPage = await fetchText(url);
  assertSelector(movieListPage, ".gallery__item .title");
  const $ = cheerio.load(movieListPage);

  const moviePageUrls = new Set();
  $(".gallery__item .title").each(function () {
    const path = $(this).attr("href");
    if (!path) return;
    moviePageUrls.add(`${domain}${path}`);
  });

  const moviePages = {};
  for (const moviePageUrl of [...moviePageUrls]) {
    moviePages[moviePageUrl] = await fetchText(moviePageUrl);
  }

  return { movieListPage, moviePages };
}

module.exports = retrieve;
