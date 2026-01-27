const { fetchText } = require("../../common/utils");

async function retrieve({ url }) {
  const page = await fetchText(url);
  const events = page.match(/<script>\s*var\s+Events\s+=\s+(.*)\s+<\/script>/i);
  const movieListPage = JSON.parse(events[1]);

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
