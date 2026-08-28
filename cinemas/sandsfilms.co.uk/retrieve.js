const eventiveRetrieve = require("../../common/eventive/retrieve");
const { url } = require("./attributes");

async function retrieve() {
  const movieListPage = await eventiveRetrieve(url);

  return { movieListPage };
}

module.exports = retrieve;
