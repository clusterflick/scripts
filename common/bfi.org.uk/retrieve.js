const { withPlaywrightSession } = require("../get-page-with-playwright");
const discoverCalendarShows = require("./discover-calendar");
const { loadShowInto } = require("./load-shows");

// The shared BFI flow (used by IMAX): discover shows from the year-long calendar
// search, then load each show's own listing page for its performances. One
// browser is shared across the calendar and every show page.
async function retrieve(attributes) {
  return withPlaywrightSession(async (getPage) => {
    const { movieListPage, shows } = await discoverCalendarShows(
      getPage,
      attributes,
    );

    console.log(
      `    - [${Date.now()}] Loading ${shows.length} show pages ... `,
    );
    const moviePages = {};
    const loadedIds = new Set();
    for (const show of shows) {
      await loadShowInto(getPage, attributes, show, moviePages, loadedIds);
    }

    return { movieListPage, moviePages };
  });
}

module.exports = retrieve;
