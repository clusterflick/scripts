const { format, parseISO } = require("date-fns");
const {
  probeJson,
  probeError,
  startObservation,
  withChallengeRetry,
} = require("../../common/health-probe");
const {
  getListingRequest,
  isFilmProduction,
  stripClassification,
} = require("./utils");

// A single venue rather than a chain, so this hangs off the cinema module
// alongside `retrieve` and `transform` rather than sitting under `common/`.
//
// The one call the retrieve starts from carries the whole schedule: every
// production on sale with its performances, each dated. What the probe skips is
// what comes after - the retrieve searches the museum's own site for each film's
// page and opens it, which is where its dozen-odd requests go.
//
// So 1 request against a retrieve's 13, with real performance counts. The IMAX
// programme is a small part of what this API sells - planetarium shows,
// workshops and simulator rides come back in the same response - so the film
// filter is what makes this a cinema listing rather than a museum diary, and it
// is the same one the retrieve applies.
const GRANULARITY = "performance";

const tally = (productions) => {
  const films = new Set();
  const byDate = {};
  const unparsed = [];

  for (const production of productions) {
    if (!isFilmProduction(production)) continue;

    for (const performance of production.performances) {
      const date = parseISO(performance.iso8601DateString ?? "");
      if (isNaN(date.getTime())) {
        unparsed.push(
          performance.iso8601DateString ??
            `(no date on a performance of "${production.productionTitle}")`,
        );
        continue;
      }

      const day = format(date, "yyyy-MM-dd");
      byDate[day] = (byDate[day] ?? 0) + 1;
      // The performance's own title rather than the production's, because a
      // season is one production carrying a different film each night - which is
      // exactly why the retrieve expands those into separate entries. Its
      // certificate is dropped so one film on two certificates counts once.
      films.add(stripClassification(performance.performanceTitle));
    }
  }

  if (unparsed.length > 0) {
    throw probeError(
      `${unparsed.length} performance(s) had an unreadable date (e.g. "${unparsed[0]}")`,
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
    const listing = await withChallengeRetry(
      () => probeJson(...getListingRequest()),
      venue.id,
    );
    countRequest();

    const productions = listing?.productions;
    if (!Array.isArray(productions)) {
      throw probeError("The listing response carries no productions");
    }
    // The response covers everything the museum sells, so an empty one is the
    // API having changed rather than the cinema having nothing on - the film
    // filter below is what decides that.
    if (productions.length === 0) {
      throw probeError("The listing response carries no productions at all");
    }

    ({ films, byDate } = tally(productions));
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
