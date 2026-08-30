const {
  probeText,
  probeError,
  startObservation,
  withChallengeRetry,
} = require("../../common/health-probe");
const { extractScreenings } = require("./utils");
const attributes = require("./attributes");

// A single venue rather than a chain, so this hangs off the cinema module
// alongside `retrieve` and `transform` rather than sitting under `common/`.
//
// The RSC payload the retrieve reads the screening ids out of carries the whole
// screening beside each id - its date, its film, its capacity - so everything
// counted here is already on the page the retrieve fetches first. What the probe
// skips is the API call the retrieve then makes per screening, 73 of them the
// day this was written, so 1 request against a retrieve's 74.
const GRANULARITY = "performance";

// `screeningDate` is a local ISO timestamp ("2026-08-31T18:30"), so the date is
// its first ten characters and no parsing is needed. Anything else is a shape
// change worth failing on rather than quietly counting fewer showings.
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}/;

const tally = (screenings) => {
  const films = new Set();
  const byDate = {};
  const unparsed = [];

  for (const screening of screenings) {
    const date = screening.screeningDate?.match(DATE_TIME)?.[1];
    if (!date) {
      unparsed.push(screening.screeningDate ?? "(no screeningDate)");
      continue;
    }
    byDate[date] = (byDate[date] ?? 0) + 1;
    // The film id rather than the title: the venue runs the same film more than
    // once and the payload keys each screening to it.
    films.add(screening.filmId);
  }

  if (unparsed.length > 0) {
    throw probeError(
      `${unparsed.length} screening(s) had an unreadable screeningDate (e.g. "${unparsed[0]}")`,
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
    const html = await withChallengeRetry(
      () => probeText(attributes.url),
      venue.id,
    );
    countRequest();
    ({ films, byDate } = tally(extractScreenings(html)));
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
