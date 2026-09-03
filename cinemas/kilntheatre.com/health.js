const createListingTotalsHealth = require("../../common/listing-totals-health");
const { url } = require("./attributes");

// Films only. The cinema listing is titles and links - no date, no time, no
// `time` element anywhere on it - and the transform reads a film's dates off
// its own page.
//
// So 1 request against a retrieve's 12, and no date axis. Worth noting for
// anyone extending this: the listing links to a film's pretty URL, and the
// retrieve already knows some of those 404 and have to be rebuilt from the link
// text. A probe counting links doesn't care, but a probe that opened them would.
module.exports = createListingTotalsHealth({
  pages: () => [url],
  listing: ".c-film-listing",
  entry: ".c-film-listing",
  link: "a",
});
