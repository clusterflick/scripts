const { fetchJson, fetchText, getText } = require("../../common/utils");
const { walkListing } = require("./utils");
const { domain } = require("./attributes");

async function retrieve() {
  const movieIds = new Set();
  const movieTitles = new Map();

  await walkListing(
    (url) => fetchJson(url),
    ($) => {
      $(".listing--event").each(function () {
        const movieId = $(this)
          .find("button.saved-event-button")
          .data("saved-event-id");

        movieIds.add(movieId);
        movieTitles.set(
          movieId,
          getText($(this).find(".listing-title--event")),
        );
      });
    },
  );

  const moviePages = [];
  for (const movieId of movieIds) {
    try {
      const [performancePage, listingPage] = await Promise.all([
        fetchText(`${domain}/whats-on/event/${movieId}/performances`),
        fetchText(`${domain}/node/${movieId}`),
      ]);

      moviePages.push({
        movieId,
        title: movieTitles.get(movieId),
        performancePage,
        listingPage,
      });
    } catch (e) {
      if (e.message.includes("500 Internal Server Error")) {
        console.log(
          `Skipping retrieving movie details due to Internal Server Error: ${domain}/node/${movieId}`,
        );
        continue;
      }
      throw e;
    }
  }

  return { moviePages };
}

module.exports = retrieve;
