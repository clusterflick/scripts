const cheerio = require("cheerio");
const { fetchText, assertSelector } = require("../../common/utils");
const { url, domain } = require("./attributes");

async function retrieve() {
  // Ibraaz programmes talks, workshops and performances alongside its films,
  // and the Ticket Tailor listings they all share carry nothing but a title -
  // so the site's own film category is what tells us which events are films.
  const movieListPage = await fetchText(url);
  const $ = cheerio.load(movieListPage);

  // Ibraaz's films run in seasons, so between them the film category is
  // legitimately empty and the gallery holds nothing at all. The site prints
  // "No events found under category Film" in its place, and that message is
  // the only thing separating an empty programme from a structure change.
  if ($(".gallery__item .title").length === 0) {
    assertSelector(
      movieListPage,
      '.page__body .rubric:contains("No events found")',
      `Expected ".gallery__item .title" not found, and no empty-category message in its place — the page structure may have changed`,
    );
    return { movieListPage, moviePages: {} };
  }

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
