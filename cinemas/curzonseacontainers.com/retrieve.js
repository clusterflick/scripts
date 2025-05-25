const attributes = require("./attributes");
const { fetchText } = require("../../common/utils");

async function retrieve() {
  const movieListPage = await fetchText(attributes.url);
  return { movieListPage };
}

module.exports = retrieve;
