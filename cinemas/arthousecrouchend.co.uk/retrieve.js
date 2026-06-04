const cheerio = require("cheerio");
const { fetchText, assertSelector } = require("../../common/utils");
const { domain } = require("./attributes");

async function retrieve() {
  const movieListPageUrl = `${domain}/booking-now/`;
  const streamedTheatreListPageUrl = `${domain}/streamed-theatre/`;
  const movieListPages = await Promise.all([
    fetchText(movieListPageUrl),
    fetchText(streamedTheatreListPageUrl),
  ]);
  assertSelector(movieListPages[0], ".performance");

  const moviePageUrls = new Set();
  movieListPages.forEach((movieListPage) => {
    const $ = cheerio.load(movieListPage);
    $(".performance").each(function () {
      const path = $(this)
        .find(
          [
            ".programme > a", // Movie URL
            ".event-show-title a", // Streamed theatre URL
          ].join(","),
        )
        .attr("href");
      moviePageUrls.add(`${domain}${path}`);
    });
  });

  const moviePages = {};
  for (const moviePageUrl of [...moviePageUrls]) {
    moviePages[moviePageUrl] = await fetchText(moviePageUrl);
  }

  return {
    movieListPages,
    moviePages,
  };
}

module.exports = retrieve;
