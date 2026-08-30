const {
  probeJson,
  probeError,
  startObservation,
  withChallengeRetry,
} = require("../../common/health-probe");
const { walkListing } = require("./utils");

// A single venue rather than a chain, so this hangs off the cinema module
// alongside `retrieve` and `transform` rather than sitting under `common/`.
//
// The probe walks the cinema listing and stops where the retrieve fans out: 5
// requests for the 93 events on the day this was written, against a retrieve's
// 160, which opens a performances page and a node page for every one of them.
//
// Films only, and that is the whole of what this venue can be asked cheaply.
// The listing cards carry an event id, a title and a blurb and no date of any
// kind - no `time` element, no date text, nothing in the accordion - so there is
// no date axis to count without opening the per-event pages this exists to
// avoid. The site's own day filter takes one date at a time, which is the same
// fan-out by another name, and there is no JSON API behind the listing.
//
// So this reports a film total and no `byDate`, and says so with a granularity
// of its own rather than borrowing one that promises dates. It catches the
// listing breaking, the cinema filter changing under us and the programme
// emptying; it cannot see a publish that adds dates to films already listed.
const GRANULARITY = "film-totals";

async function health(venues) {
  const { countRequest, reasonFor, finalise } = startObservation(GRANULARITY);
  const [venue] = venues;

  const films = new Set();
  try {
    // Wrapped as one unit rather than per page: a challenge part-way through a
    // walk has to start the walk again, not resume it.
    await withChallengeRetry(
      () =>
        walkListing(
          (url) => {
            countRequest();
            return probeJson(url);
          },
          ($) => {
            $(".listing--event").each(function () {
              // The saved-event id rather than the title: the Barbican lists
              // the same film under a strand name and as a members' screening,
              // and the retrieve keys on this too. A card without one is a
              // shape change rather than a listing to pass over.
              const id = $(this)
                .find("button.saved-event-button")
                .data("saved-event-id");
              if (id === undefined) {
                throw probeError(
                  "A cinema listing has no `saved-event-id` - the listing markup may have changed",
                );
              }
              films.add(id);
            });
          },
        ),
      venue.id,
    );
  } catch (error) {
    return finalise([{ venue: venue.id, reason: reasonFor(error) }]);
  }

  if (films.size === 0) {
    return finalise([
      { venue: venue.id, reason: { kind: "no-listings-found" } },
    ]);
  }

  return finalise([{ venue: venue.id, counts: { films: films.size } }]);
}

module.exports = health;
