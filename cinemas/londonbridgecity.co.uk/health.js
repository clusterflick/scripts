const createListingTotalsHealth = require("../../common/listing-totals-health");
const { url } = require("./attributes");
const { isFilmEntry } = require("./utils");

// Films only. The what's-on carries no date on its entries at all - the
// transform reads a screening's dates off the event page - so this counts the
// nine of thirty-two entries that are cinema, at 1 request against a retrieve's
// 10.
//
// These are outdoor summer screenings by the river, so a listing with no films
// on it is the ordinary winter state rather than a breakage.
module.exports = createListingTotalsHealth({
  pages: () => [url],
  listing: ".event-summary",
  entry: ".event-summary",
  isFilm: isFilmEntry,
  // The summary sits inside the card's link rather than around it, which is
  // where the retrieve reads the href from too.
  link: ($entry) => $entry.closest("a").attr("href"),
});
