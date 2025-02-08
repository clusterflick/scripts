const { fetchJson, fetchText } = require("../../common/utils");
const { domain } = require("./attributes");

async function retrieve() {
  const url = `${domain}/whats-on/cinema/?ajax=1&json=1`;
  const movieListPage = await fetchJson(url);

  const moviePages = {};
  for (movie of movieListPage) {
    const moviePageUrl = `https://richmix.org.uk/cinema/${movie.slug}/`;
    moviePages[movie.id] = await fetchText(moviePageUrl);
  }

  return {
    movieListPage,
    moviePages,
  };
}

module.exports = retrieve;
