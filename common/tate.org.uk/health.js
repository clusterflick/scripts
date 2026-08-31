const createListingTotalsHealth = require("../listing-totals-health");
const { LISTING, LISTING_ENTRY, LISTING_LINK } = require("./utils");

// Two galleries on one site, each with its own what's-on filtered to its own
// film programme, so there is no call that answers for both: this is a per-venue
// probe each cinema module exports beside its `retrieve` and `transform`.
//
// The probe reads that listing and stops - 1 request against a retrieve's 6 at
// Tate Britain, which opens every event's page for its dates and description.
//
// Films only, deliberately. The cards do carry a date, but it is the event's
// start rather than its run, and the listing writes it nine different ways
// across the gallery's programme - "15 Oct 2026", "5-11 Oct 2026", "Until 31
// Aug 2026", "Daily, 12 Sep - 15 Nov 2026", "Ongoing". The transform reads the
// event page instead, where the dates are unambiguous, and expands a run into a
// performance per day. A byDate built from these cards would neither match what
// we publish nor survive the next format on that list.
module.exports = createListingTotalsHealth({
  pages: (venue) => [venue.url],
  listing: LISTING,
  entry: LISTING_ENTRY,
  link: LISTING_LINK,
});
