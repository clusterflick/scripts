const { isPrivateHire } = require("../utils");
const {
  probeText,
  probeError,
  startObservation,
  withChallengeRetry,
} = require("../health-probe");
const { extractEvents } = require("./utils");

// Savoy Systems venues are separate cinemas that happen to run the same booking
// software, not a chain with one listing call, so this is a per-venue probe each
// cinema module exports beside its `retrieve` and `transform`.
//
// The what's-on page the retrieve fetches first already carries the whole
// listing: a `var Events` JSON blob holding every film and, on each, every
// performance with its own `StartDate`. What the probe skips is the per-film
// page the retrieve then opens for the ld+json synopsis - 49 of them at the Rio
// the day this was written - so 1 request against a retrieve's 50.
//
// The page is large (the Rio's is 850KB, most of it synopsis text inside the
// blob) and there is no smaller endpoint behind it: the cost of this probe is a
// download rather than a round trip, which is still an hour's worth of listing
// for one request.
//
// Performances are individual showings, so this reports real performance counts
// rather than a film x date matrix.
const GRANULARITY = "performance";

// `StartDate` arrives as "2026-08-31" and is used as-is - the transform parses
// it with the time beside it, but a probe counting per date needs no clock.
// Anything else is a shape change worth failing on rather than quietly
// bucketing showings under a date that isn't one.
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const tally = (listing) => {
  const events = listing.Events;
  if (!Array.isArray(events)) {
    throw probeError("The `var Events` listing data holds no `Events` array");
  }

  const films = new Set();
  const byDate = {};
  const unparsed = [];

  for (const event of events) {
    // Private hires are bookings of the screen, not screenings; the transform
    // drops them, so counting them here would report listings we never publish.
    if (isPrivateHire(event.Title)) continue;

    // A film can be listed before it is on sale, which arrives as an event with
    // an empty performance list. That is a film with no showings rather than a
    // shape change, so it simply contributes nothing.
    for (const performance of event.Performances ?? []) {
      const date = performance.StartDate;
      if (!DATE.test(date ?? "")) {
        unparsed.push(date ?? "(no StartDate)");
        continue;
      }
      byDate[date] = (byDate[date] ?? 0) + 1;
      // The event id rather than the title: a venue can list the same film
      // twice under different strand names, and the retrieve keys on this too.
      films.add(event.ID);
    }
  }

  if (unparsed.length > 0) {
    throw probeError(
      `${unparsed.length} performance(s) had an unreadable StartDate (e.g. "${unparsed[0]}")`,
    );
  }

  return { films, byDate };
};

async function health(venues) {
  const { countRequest, reasonFor, finalise } = startObservation(GRANULARITY);
  const [venue] = venues;

  let films;
  let byDate;
  try {
    const html = await withChallengeRetry(() => probeText(venue.url), venue.id);
    countRequest();
    ({ films, byDate } = tally(extractEvents(html)));
  } catch (error) {
    countRequest();
    return finalise([{ venue: venue.id, reason: reasonFor(error) }]);
  }

  const dates = Object.keys(byDate).sort();
  if (dates.length === 0) {
    return finalise([
      { venue: venue.id, reason: { kind: "no-listings-found" } },
    ]);
  }

  return finalise([
    {
      venue: venue.id,
      counts: {
        performances: dates.reduce((total, date) => total + byDate[date], 0),
        films: films.size,
        dates: dates.length,
      },
      // Sorted so consecutive cycles diff cleanly.
      byDate: Object.fromEntries(dates.map((date) => [date, byDate[date]])),
    },
  ]);
}

module.exports = health;
