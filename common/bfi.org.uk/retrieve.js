const discoverCalendarShows = require("./discover-calendar");
const { loadShowInto } = require("./load-shows");

// The shared BFI flow (used by IMAX): discover shows from the year-long calendar
// search, then load each show's own listing page for its performances.
async function retrieve(attributes) {
  const { movieListPage, shows } = await discoverCalendarShows(attributes);

  console.log(`    - [${Date.now()}] Loading ${shows.length} show pages ... `);
  const moviePages = {};
  const loadedIds = new Set();
  for (const show of shows) {
    await loadShowInto(attributes, show, moviePages, loadedIds);
  }

  return { movieListPage, moviePages };
}

module.exports = retrieve;
