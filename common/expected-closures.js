const { format } = require("date-fns");

// Venues we know are dark, and the window they're dark for. A venue listed here
// transforms to nothing when its listings come back empty, instead of failing
// the run: an empty response from a closed cinema is the truth about the venue,
// not evidence the scrape has broken.
//
// Everything here is temporary. An entry only applies inside its own window, so
// the venue goes back to failing loudly the moment the closure is meant to be
// over - a carve-out left behind by accident cannot quietly swallow a real
// breakage. Delete lapsed entries.
//
// The window is the announced closure and nothing more. A chain sells tickets
// ahead of the date, so listings come back before the doors do: the venue
// usually stops being empty part-way through its own window, and the entry
// simply stops mattering. Padding the end is therefore the wrong way round -
// all it buys is days in which a real breakage looks like the closure. Still
// empty once the venue is meant to be open is worth a red job either way,
// whether the works overran or the scrape broke.
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
    until: "2026-09-04",
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
