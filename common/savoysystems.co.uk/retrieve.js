const { fetchText } = require("../../common/utils");

async function retrieve({ url }) {
  const page = await fetchText(url);
  const events = page.match(/<script>\s*var\s+Events\s+=\s+(.*)\s+<\/script>/i);
  const movieListPage = JSON.parse(events[1]);

  // Fetch the individual movie pages to get full descriptions
  const moviePages = {};
  for (const movie of movieListPage.Events) {
    if (!movie.URL) continue;
    try {
      moviePages[movie.ID] = await fetchText(movie.URL);
    } catch (error) {
      // Savoy can fail to render a single event's page while the listing and
      // every other page are fine - the Phoenix's "Strangers In Our Own Land?"
      // returned a 500 for hours, every time. The page only adds the full
      // description, which transform falls back from to the listing's Synopsis,
      // so one broken record shouldn't void the venue. Anything else (a 404,
      // or a 502/503/504 that outlasted its retries) still throws.
      if (error.status !== 500) throw error;
      console.log(
        `! Skipping description for "${movie.Title}" - ${movie.URL} returned 500`,
      );
    }
  }

  return { movieListPage, moviePages };
}

module.exports = retrieve;
