const createListingTotalsHealth = require("../../common/listing-totals-health");
const { url } = require("./attributes");

// Listings rather than films, and no date axis, for two separate reasons.
//
// This is the theatre's whole what's-on - squash tournaments and concerts
// alongside the occasional screening - and film is only told from the rest by
// the transform, which runs `isFilmEvent` over each event's title *and* its
// description. The description is on the event page, so a probe reading only
// the listing cannot make that call: matching on titles alone would drop most
// of the films, since a venue rarely puts "screening" in one. Counting the
// what's-on as it stands is the honest alternative, the same choice the Tribe
// venues make.
//
// The cards do carry a `dates`, but on events rather than screenings, and in
// two shapes - "18 Sep 2026" and "2 - 6 Sep 2026" - the second being a run of
// something that isn't a film.
//
// So 1 request against a retrieve's 18, counting what the venue has listed. A
// row here moves for reasons that have nothing to do with cinema; what it is
// good for is knowing the listing still parses.
module.exports = createListingTotalsHealth({
  pages: () => [url],
  listing: ".event_card",
  entry: ".event_card",
  link: "a.event_target",
  countName: "listings",
});
