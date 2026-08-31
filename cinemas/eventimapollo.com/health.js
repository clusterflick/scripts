const createListingTotalsHealth = require("../../common/listing-totals-health");
const { url } = require("./attributes");
const { isFilmEntry } = require("./utils");

// Films only. The cards are dated, and all but one of the sixteen film entries
// listed the day this was written carried a single day ("Sunday 20th September
// 2026"). The exception is a range - "Nov 29th - Dec 6th 2026" - so a date axis
// built here would be reporting a run as a day or failing on it, neither of
// which is worth having when the film count already moves on a publish.
//
// So 1 request against a retrieve's 17, counting the same film entries the
// retrieve opens: this is a music venue, and its what's-on is 81 listings of
// which 16 are cinema.
module.exports = createListingTotalsHealth({
  pages: () => [url],
  listing: "[data-search-text]",
  entry: "[data-search-text]",
  isFilm: isFilmEntry,
  link: "a.cover-link",
});
