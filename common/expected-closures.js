const { format } = require("date-fns");

// Venues we know are dark, and the window they're dark for. A venue listed here
// transforms to nothing when its listings come back empty, instead of failing
// the run: an empty response from a closed cinema is the truth about the venue,
// not evidence the scrape has broken.
//
// Everything here is temporary. An entry only applies inside its own window, so
// the venue goes back to failing loudly the moment the closure is meant to be
// over - a carve-out left behind by accident cannot quietly swallow a real
// breakage. `until` wants a few days of slack past the reopening date, because
// listings tend to go back up later than the doors do. Delete lapsed entries.
//
// Every entry cites where the closure was announced. Listings simply being
// empty is never the evidence - that is the failure this carves an exception
// out of, not a reason to add one.
//
// Dates are inclusive `yyyy-MM-dd`, read in the pipeline's timezone
// (Europe/London).
const expectedClosures = [
  {
    venue: "myvue.com-finchley-road",
    from: "2026-08-28",
    until: "2026-09-08",
    // "Vue will be temporarily closed from Friday 28th August - Friday 4th
    // September for refurbishment works."
    // https://www.o2centre.co.uk/en/play-listing/vue
    reason: "refurbishment works, reopening Saturday 5th September 2026",
  },
];

// The closure covering this venue today, or undefined if it has none - so a
// caller can say in the log which closure it is standing down for.
function getExpectedClosure(venueId, now = new Date()) {
  const today = format(now, "yyyy-MM-dd");
  return expectedClosures.find(
    ({ venue, from, until }) =>
      venue === venueId && from <= today && today <= until,
  );
}

module.exports = { expectedClosures, getExpectedClosure };
