const { format } = require("date-fns");
const {
  probeJson,
  probeError,
  startObservation,
  withChallengeRetry,
} = require("../../common/health-probe");
const { LISTING_URL, isFilmEvent } = require("./utils");

// A single venue rather than a chain, so this hangs off the cinema module
// alongside `retrieve` and `transform` rather than sitting under `common/`.
//
// The one ajax call the retrieve starts from carries every event's performances
// with it - a map keyed by day, each holding that day's showings with a unix
// timestamp apiece - so everything counted here is already in the response the
// retrieve reads the film list out of. What the probe skips is the event page
// the retrieve then opens per film, 37 of them the day this was written for 200
// showings, so 1 request against a retrieve's 38.
const GRANULARITY = "performance";

const tally = (events) => {
  const films = new Set();
  const byDate = {};

  for (const event of events) {
    if (!isFilmEvent(event)) continue;

    // The same showing has been entered twice in this feed before, which the
    // transform drops; counting both would report a showing we never publish.
    const timestamps = new Set();
    for (const performances of Object.values(event.performances ?? {})) {
      for (const { timestamp } of performances) {
        // A season announced before its dates go on sale is listed with a stub
        // under day key "0", carrying no timestamp and no booking link. There
        // is nothing on sale to count, and the transform skips it too.
        if (!timestamp) continue;
        timestamps.add(timestamp);
      }
    }

    if (timestamps.size === 0) continue;

    for (const timestamp of timestamps) {
      const date = new Date(parseInt(timestamp, 10) * 1000);
      if (isNaN(date.getTime())) {
        throw probeError(
          `A performance of "${event.title}" has an unreadable timestamp ("${timestamp}")`,
        );
      }
      const day = format(date, "yyyy-MM-dd");
      byDate[day] = (byDate[day] ?? 0) + 1;
    }
    // The event's own url rather than its title, which is what the retrieve
    // keys its event pages on too.
    films.add(event.url);
  }

  return { films, byDate };
};

async function health(venues) {
  const { countRequest, reasonFor, finalise } = startObservation(GRANULARITY);
  const [venue] = venues;

  let films;
  let byDate;
  try {
    const events = await withChallengeRetry(
      () => probeJson(LISTING_URL),
      venue.id,
    );
    countRequest();

    if (!Array.isArray(events)) {
      throw probeError("The listing response is not a list of events");
    }
    // The call returns the venue's whole programme - theatre, comedy and music
    // alongside the cinema - so an empty list is the listing breaking rather
    // than the cinema having nothing on, and is worth failing on.
    if (events.length === 0) {
      throw probeError("The listing response carries no events at all");
    }

    ({ films, byDate } = tally(events));
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
