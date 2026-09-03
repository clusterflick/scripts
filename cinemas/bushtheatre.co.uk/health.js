const createListingTotalsHealth = require("../../common/listing-totals-health");
const attributes = require("./attributes");

// Listings rather than films, and no date axis.
//
// The events listing carries a title and a link and nothing else - no date, no
// time - and the theatre marks nothing on it as cinema, so film is only told
// from the rest by the transform, which runs `isFilmEvent` over an event's
// title and its description. The description is on the event page, and its
// docstring is explicit that a title-only match is not enough, so a probe
// reading the listing cannot make that call without opening what it is trying
// to avoid opening.
//
// So 1 request against a retrieve's 13, counting what the theatre has listed. A
// row here moves for reasons that have nothing to do with cinema; what it is
// good for is knowing the listing still parses.
module.exports = createListingTotalsHealth({
  pages: () => [attributes.url],
  listing: ".events_listing",
  entry: ".events_listing .events_item__link",
  // The entry is itself the link the retrieve reads.
  link: ($entry) => $entry.attr("href"),
  countName: "listings",
});
