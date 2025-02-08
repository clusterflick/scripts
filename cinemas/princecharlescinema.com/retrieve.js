const { fetchText } = require("../../common/utils");
const { domain } = require("./attributes");

async function retrieve() {
  const movieListPage = await fetchText(`${domain}/whats-on/`);
  return { movieListPage };
}

module.exports = retrieve;
