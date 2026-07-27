const { fetchText, assertSelector } = require("../utils");

async function retrieve({ url }) {
  const movieListPage = await fetchText(url);
  assertSelector(movieListPage, ".text-block");

  return { movieListPage };
}

module.exports = retrieve;
