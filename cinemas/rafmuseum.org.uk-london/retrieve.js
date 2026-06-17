const { fetchText, assertSelector } = require("../../common/utils");
const { url } = require("./attributes");

// All listing data lives on a single page — there are no per-film detail pages.
async function retrieve() {
  const movieListPage = await fetchText(url);
  assertSelector(movieListPage, "article h6");
  return { movieListPage };
}

module.exports = retrieve;
