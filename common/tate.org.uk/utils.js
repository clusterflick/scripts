// The what's-on listing, filtered to film at the gallery in question by each
// venue's own `url`. Shared with the health probe, which reads the same listing
// the retrieve starts from.
const LISTING = ".card-list";
const LISTING_ENTRY = ".card-list .card";
const LISTING_LINK = "a";
const LISTING_CARD_LINK = `${LISTING_ENTRY} ${LISTING_LINK}`;

module.exports = { LISTING, LISTING_ENTRY, LISTING_LINK, LISTING_CARD_LINK };
