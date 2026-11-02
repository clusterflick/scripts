const { fetchText } = require("../../common/utils");
const { url } = require("./attributes");
const { parseEvents } = require("./utils");

async function retrieve() {
  const movieListPage = await fetchText(url);
  // Parsed here too, so a page that has changed shape fails at retrieve rather
  // than saving something the transform can't read.
  parseEvents(movieListPage);
  return { movieListPage };
}

module.exports = retrieve;
