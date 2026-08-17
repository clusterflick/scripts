const cheerio = require("cheerio");
const { fetchText, getText, assertSelector } = require("../../common/utils");
const { url, domain } = require("./attributes");

// Rendered by the listing in place of the event list when nothing is scheduled
const emptyListingMessage = "There are currently no events";

async function retrieve() {
  const movieListPage = await fetchText(url);
  const $ = cheerio.load(movieListPage);

  // This is a monthly pop-up, so the film listing is regularly empty between
  // screenings. Only the site's own "no events" message excuses a missing
  // ".event-card" list — anything else means the page structure has changed.
  if (!getText($(".content-panel")).includes(emptyListingMessage)) {
    assertSelector(movieListPage, ".event-card");
  }

  // Extract film event URLs from the listing page
  const moviePageUrls = new Set();
  $(".event-card").each(function () {
    const href = $(this).find(".event-card__content h3 a").attr("href");
    if (href) {
      const fullUrl = href.startsWith("http") ? href : `${domain}${href}`;
      moviePageUrls.add(fullUrl);
    }
  });

  const moviePages = {};
  for (const moviePageUrl of [...moviePageUrls]) {
    const moviePage = await fetchText(moviePageUrl);
    moviePages[moviePageUrl] = moviePage;
  }

  return {
    movieListPage,
    moviePages,
  };
}

module.exports = retrieve;
