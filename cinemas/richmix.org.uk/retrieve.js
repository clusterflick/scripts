const cheerio = require("cheerio");
const { fetchText, assertSelector } = require("../../common/utils");
const { domain } = require("./attributes");

async function retrieve() {
  const movieListPageUrl = `${domain}/cinema/`;
  const movieListPage = (await fetchText(movieListPageUrl)).trim();
  assertSelector(
    movieListPage,
    "#page-content .c-card .c-card__actions .c-card__action--primary",
  );
  const $ = cheerio.load(movieListPage);

  const moviePageUrls = new Set();
  $("#page-content .c-card .c-card__actions .c-card__action--primary").each(
    function () {
      moviePageUrls.add($(this).attr("href"));
    },
  );

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
