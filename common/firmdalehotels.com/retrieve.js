const { fetchText } = require("../utils");

async function retrieve({ url }) {
  const movieListPage = await fetchText(url);

  return { movieListPage };
}

module.exports = retrieve;
