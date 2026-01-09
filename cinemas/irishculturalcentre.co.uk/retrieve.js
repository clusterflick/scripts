const { fetchText } = require("../../common/utils");
const { url } = require("./attributes");

async function retrieve() {
  const movieListPage = await fetchText(url);
  return { movieListPage };
}

module.exports = retrieve;
