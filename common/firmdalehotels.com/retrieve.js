const { fetchText, assertSelector } = require("../utils");

async function retrieve({ url }) {
  const movieListPage = await fetchText(url);
  assertSelector(movieListPage, ".text-block h2.heading--h3");

  return { movieListPage };
}

module.exports = retrieve;
