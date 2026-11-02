const cheerio = require("cheerio");

const LISTING_PAGE_TITLE = "What's On - LIVE";
const EVENT_PAGE_TITLE = "Programme";
const FILM_LABEL = /^(films?|(film )?screenings?)$/i;
const LISTING_DATE =
  /\d{1,2}\s+[A-Z][a-z]+,\s*\d{1,2}(?:[.:]\d{2})?\s*(?:am|pm)/g;

const collapse = (value) => value.replace(/\s+/g, " ").trim();

// Cargo keeps every page's markup in its preloaded state, which is the same
// text the page renders without the 1MB of site design around it.
const getPageFromState = (html, matches) => {
  const marker = html.match(/__PRELOADED_STATE__\s*=\s*/);
  if (!marker) {
    throw new Error(
      "No __PRELOADED_STATE__ found - has the site moved off Cargo?",
    );
  }
  const start = marker.index + marker[0].length;
  const end = html.indexOf("</script>", start);
  const state = JSON.parse(html.slice(start, end).trim().replace(/;$/, ""));
  const page = Object.values(state.pages.byId).find(matches);
  if (!page?.content) {
    throw new Error("Expected page not found in __PRELOADED_STATE__");
  }
  return page;
};

// The page is laid out by hand: each listing is a column holding a linked
// image, then a label as loose text, then a bold title, then a date as loose
// text. A listing that has lost any of those means the layout has changed, and
// a film could be hiding in it, so it stops the run rather than being skipped.
const parseListings = (listingContent) => {
  const $ = cheerio.load(listingContent, null, false);
  const units = $("column-unit").toArray();
  if (units.length === 0) {
    throw new Error("No listings found - the page structure may have changed");
  }

  return units.map((unit) => {
    const $unit = $(unit);
    const href = $unit.find("media-item[href]").first().attr("href");
    const text = $unit.text();
    const titleElement = $unit
      .find("b")
      .toArray()
      .find((b) => collapse($(b).text()));
    const rawTitle = titleElement ? $(titleElement).text() : "";
    const titleAt = rawTitle ? text.indexOf(rawTitle) : -1;
    const label = titleAt > -1 ? collapse(text.slice(0, titleAt)) : "";
    const title = collapse(rawTitle);
    if (!href || !label || !title) {
      throw new Error(
        `Listing breaks the label/title/date pattern: ${collapse(text)}`,
      );
    }
    const after = text.slice(titleAt + rawTitle.length);
    return { href, label, title, after };
  });
};

const isFilmListing = ({ label }) => FILM_LABEL.test(label);

const getListedDates = ({ after }) => collapse(after).match(LISTING_DATE) || [];

module.exports = {
  EVENT_PAGE_TITLE,
  LISTING_PAGE_TITLE,
  getPageFromState,
  parseListings,
  isFilmListing,
  getListedDates,
};
