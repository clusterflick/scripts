const { fetchText } = require("../../common/utils");
const attributes = require("./attributes");

async function retrieve() {
  const movieListPage = await fetchText(attributes.url);

  return { movieListPage };
}

module.exports = retrieve;
