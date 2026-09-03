const createListingTotalsHealth = require("../../common/listing-totals-health");
const { url } = require("./attributes");
const { LISTING, LISTING_ENTRY, LISTING_LINK } = require("./utils");

// A single venue rather than a chain, so this hangs off the cinema module
// alongside `retrieve` and `transform` rather than sitting under `common/`.
//
// This venue is ticketed by Spektrix, and JW3's probe next door counts real
// performances out of Spektrix's client-wide events and instances calls. That
// does not work here. The Spektrix client is the council's - Forty Hall, Active
// Enfield and the Museum of Enfield share it, 1104 events against JW3's 267 -
// and the events call ignores `startFrom`, so the two calls that cost JW3 360KB
// cost this venue 2.5MB, every hour, to count five listings. That is worse than
// the retrieve it would be saving.
//
// So this reads the venue's own film listing and stops: one request, and no
// dates, because the cards carry a title, a type and a duration and nothing
// else.
//
// Listings rather than films: the grid carries series pages - "Talkies Community
// Cinema", "Black Film Club" - alongside the films themselves, and the retrieve
// only finds out which is which by opening each page and looking for a Spektrix
// booking iframe. That is five more requests to sharpen a number this probe is
// not reporting as films in the first place.
module.exports = createListingTotalsHealth({
  pages: () => [url],
  listing: LISTING,
  entry: LISTING_ENTRY,
  link: LISTING_LINK,
  countName: "listings",
});
