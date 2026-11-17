const cheerio = require("cheerio");
const {
  fetchText,
  getText,
  assertSelector,
  getListingLinks,
} = require("../../common/utils");
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
  for (const href of getListingLinks(
    $,
    $(".event-card"),
    ".event-card__content h3 a",
  )) {
    moviePageUrls.add(href.startsWith("http") ? href : `${domain}${href}`);
  }

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
