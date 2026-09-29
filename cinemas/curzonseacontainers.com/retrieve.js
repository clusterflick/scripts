const attributes = require("./attributes");
const { fetchText, assertSelector } = require("../../common/utils");

async function retrieve() {
  const movieListPage = await fetchText(attributes.url);
  // Veezi renders an explicit empty state when nothing is scheduled, so a page
  // with neither films nor that marker is not the listing.
  assertSelector(movieListPage, "#sessionsByFilmConent .film, p.empty");
  return { movieListPage };
}

module.exports = retrieve;
