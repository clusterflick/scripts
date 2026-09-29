const { fetchText, assertSelector } = require("../../common/utils");
const { url } = require("./attributes");

async function retrieve() {
  const movieListPage = await fetchText(url);
  assertSelector(movieListPage, ".project-post");
  return { movieListPage };
}

module.exports = retrieve;
