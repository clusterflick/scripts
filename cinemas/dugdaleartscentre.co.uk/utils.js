// The venue's what's-on, filtered to film. Shared with the health probe, which
// reads the same listing the retrieve starts from.
const LISTING = ".whats-on-grid";
const LISTING_ENTRY = ".whats-on-grid .event";
const LISTING_LINK = ".event-name a";
const LISTING_EVENT_LINK = `${LISTING_ENTRY} ${LISTING_LINK}`;

module.exports = { LISTING, LISTING_ENTRY, LISTING_LINK, LISTING_EVENT_LINK };
