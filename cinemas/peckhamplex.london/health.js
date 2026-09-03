const createListingTotalsHealth = require("../../common/listing-totals-health");
const { domain } = require("./attributes");

// Films only. The venue is a working cinema with a daily schedule, but none of
// it is on the listing: the out-now and coming-soon pages carry a poster, a
// title and an "Info & Tickets" link, and the film page's `film-by-times` panel
// is empty in the served HTML - the showtimes are fetched by script after load.
// Reaching them would mean a browser per cycle, which is more than this venue's
// whole retrieve costs.
//
// So 2 requests against a retrieve's 35, and no date axis. It catches the
// listing breaking and the programme emptying; it cannot see a publish that
// adds showings to films already listed.
module.exports = createListingTotalsHealth({
  pages: () => [`${domain}/films/out-now`, `${domain}/films/coming-soon`],
  listing: ".title-wrapper",
  entry: ".title-wrapper",
  link: ".img a",
});
