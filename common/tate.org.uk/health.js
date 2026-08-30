const cheerio = require("cheerio");
const {
  probeText,
  probeError,
  startObservation,
  withChallengeRetry,
} = require("../health-probe");
const { LISTING, LISTING_LINK } = require("./utils");

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
// we publish nor survive the next format on that list, so this reports a film
// total and says so with its granularity.
const GRANULARITY = "film-totals";

async function health(venues) {
  const { countRequest, reasonFor, finalise } = startObservation(GRANULARITY);
  const [venue] = venues;

  let films;
  try {
    const html = await withChallengeRetry(() => probeText(venue.url), venue.id);
    countRequest();

    const $ = cheerio.load(html);
    // The same selector the retrieve asserts on. Its absence is the listing
    // having changed shape; its presence with no cards is a gallery with no
    // films on, which is ordinary here - Tate Modern was showing one film and
    // Tate Britain five the day this was written.
    if ($(LISTING).length === 0) {
      throw probeError(
        `No \`${LISTING}\` on the what's-on page - the listing may have changed shape`,
      );
    }

    films = new Set(
      $(LISTING_LINK)
        .map(function () {
          return $(this).attr("href");
        })
        .get(),
    ).size;
  } catch (error) {
    countRequest();
    return finalise([{ venue: venue.id, reason: reasonFor(error) }]);
  }

  if (films === 0) {
    return finalise([
      { venue: venue.id, reason: { kind: "no-listings-found" } },
    ]);
  }

  return finalise([{ venue: venue.id, counts: { films } }]);
}

module.exports = health;
