const createListingTotalsHealth = require("../../common/listing-totals-health");
const { domain } = require("./attributes");

// Films only. The cards do carry a `card__dates`, but it describes the run
// rather than dating it: 56 of the 59 listed the day this was written read
// "From 29 Aug", which is a start with no end, and the rest are date lists
// ("19 & 20 Sept", "12 Sept & 3 Oct"). Neither says which days a film actually
// plays, and the transform reads that off the film's own page instead.
//
// So 1 request against a retrieve's 22, and no date axis. It catches the
// listing breaking, the film filter changing under us, and the programme
// emptying.
module.exports = createListingTotalsHealth({
  // The same filtered listing the retrieve starts from: `type=72` is film.
  pages: () => [`${domain}/whats-on/?type=72&period=any#/`],
  listing: "article.card--film",
  entry: "article.card--film",
  link: ".card__content > a",
});
