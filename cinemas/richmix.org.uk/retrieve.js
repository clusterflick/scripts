const cheerio = require("cheerio");
const { fetchText, assertSelector } = require("../../common/utils");
const { domain } = require("./attributes");

const movieCardSelector =
  "#page-content .c-card .c-card__actions .c-card__action--primary";

// The cinema listing template's own header class. It is page furniture rather
// than a listing, so it is there whether or not the programme has anything in
// it, and it is on this page alone - a film's own page doesn't carry it.
const listingPageSelector = ".c-page-header--cinema-listing";

async function retrieve() {
  const movieListPageUrl = `${domain}/cinema/`;
  const movieListPage = (await fetchText(movieListPageUrl)).trim();
  const $ = cheerio.load(movieListPage);

  // Rich Mix is an arts centre that programmes film alongside music, dance and
  // exhibitions, and the cinema page empties out when it has no films booked -
  // it did in September 2026, after the run ending on the 9th, with the rest of
  // the building's programme carrying on around it. An empty page is otherwise
  // indistinguishable from a redesign, so when there are no cards to follow,
  // assert the listing template instead: still the cinema page and still
  // intact, listing nothing, is the venue telling us it has nothing on.
  if ($(movieCardSelector).length === 0) {
    assertSelector(
      movieListPage,
      listingPageSelector,
      `Expected "${movieCardSelector}" not found, and no cinema listing page in its place — the page structure may have changed`,
    );
    return { movieListPage, moviePages: {} };
  }

  const moviePageUrls = new Set();
  $(movieCardSelector).each(function () {
    moviePageUrls.add($(this).attr("href"));
  });

  const moviePages = {};
  for (const moviePageUrl of moviePageUrls) {
    moviePages[moviePageUrl] = (await fetchText(moviePageUrl)).trim();
  }

  return {
    movieListPage,
    moviePages,
  };
}

module.exports = retrieve;
