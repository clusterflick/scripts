const { fetchJson, fetchText } = require("../../common/utils");
const { domain } = require("./attributes");

const filmEventType = "101";

async function retrieve() {
  const url = `${domain}/ajax/filter_stream/ZWhHVEdwSDNuekJLUWI1OXVDQ0Fvdz09/?offset=0&limit=500`;
  const movieListPage = (await fetchJson(url)).filter((movie) => {
    // Reject events which have no type set (which seem to be room hire)
    if (!movie.event_type) return false;

    // Otherwise check the type for the film event value
    return movie.event_type.includes(filmEventType);
  });

  const moviePages = {};
  for (const movie of movieListPage) {
    moviePages[movie.url] = await fetchText(movie.url);
  }

  return { movieListPage, moviePages };
}

module.exports = retrieve;
