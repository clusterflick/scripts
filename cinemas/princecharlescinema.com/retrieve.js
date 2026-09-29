const { fetchText, assertSelector } = require("../../common/utils");
const { domain } = require("./attributes");

async function retrieve() {
  const movieListPage = await fetchText(`${domain}/whats-on/`);
  assertSelector(movieListPage, ".jacro-event");
  return { movieListPage };
}

module.exports = retrieve;
