const { fetchText } = require("../../common/utils");
const { domain, url } = require("./attributes");
const {
  EVENT_PAGE_TITLE,
  LISTING_PAGE_TITLE,
  getPageFromState,
  parseListings,
  isFilmListing,
  getListedDates,
} = require("./utils");

async function retrieve() {
  const listingHtml = await fetchText(url);
  const movieListPage = getPageFromState(
    listingHtml,
    ({ title }) => title === LISTING_PAGE_TITLE,
  ).content;

  const moviePages = {};
  for (const listing of parseListings(movieListPage).filter(isFilmListing)) {
    if (getListedDates(listing).length !== 1) {
      throw new Error(
        `Expected one date for "${listing.title}", got: ${listing.after}`,
      );
    }
    const pageHtml = await fetchText(`${domain}/${listing.href}`);
    // Whatever its url, an event page holds the event itself in a stacked page
    // titled "Programme", beside the site furniture and any artist bios.
    moviePages[listing.href] = getPageFromState(
      pageHtml,
      ({ title }) => title === EVENT_PAGE_TITLE,
    ).content;
  }

  return { movieListPage, moviePages };
}

module.exports = retrieve;
