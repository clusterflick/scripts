const { fetchJson, fetchText } = require("../../common/utils");
const { LISTING_URL, isFilmEvent } = require("./utils");

async function retrieve() {
  const movieListPage = (await fetchJson(LISTING_URL)).filter(isFilmEvent);

  const moviePages = {};
  for (const movie of movieListPage) {
    moviePages[movie.url] = await fetchText(movie.url);
  }

  return { movieListPage, moviePages };
}

module.exports = retrieve;
