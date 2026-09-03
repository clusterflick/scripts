const { fetchText } = require("../../common/utils");
const { extractEvents } = require("./utils");

async function retrieve({ url }) {
  const page = await fetchText(url);
  const movieListPage = extractEvents(page);

  // Fetch the individual movie pages to get full descriptions
  const moviePages = {};
  for (const movie of movieListPage.Events) {
    if (movie.URL) {
      moviePages[movie.ID] = await fetchText(movie.URL);
    }
  }

  return { movieListPage, moviePages };
}

module.exports = retrieve;
