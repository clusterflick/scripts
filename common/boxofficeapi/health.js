const { startOfDay, endOfDay, addYears, format } = require("date-fns");
const {
  probeJson,
  probeError,
  startObservation,
  withChallengeRetry,
} = require("../health-probe");

// Shared by every chain on this API the way `retrieve.js` here is: the chain
// module supplies its domain, and everything after that is identical. Two
// requests for a dozen venues, no browser and no chain check.
//
// `schedule` takes `theaters` repeated - one JSON object per venue. A JSON array
// of them, an object keyed by id, and comma-separated ids are all a 500; only
// repeated params work, the same convention Odeon's `siteIds` uses.
//
// This API tells an empty venue from an unknown id by itself, so nothing has
// to be cross-checked against a site list: a venue with nothing on comes back
// present with an empty schedule, while an id the chain doesn't know is left
// out of the response entirely.
//
// Showings carry a timestamp, so this reports real performance counts.
const GRANULARITY = "performance";

// The endpoint silently caps `theaters` at ten. Ask for more and it answers 200
// with ten of them and no indication the rest were dropped - which would read
// as the others vanishing from the chain. Chunking is what keeps absence from
// the response meaningful.
const MAX_THEATERS_PER_REQUEST = 10;

const formatDate = (date) => format(date, "yyyy-MM-dd'T'HH:mm:ss");

// `requestJson` is how the call is made: `probeJson` directly, unless the chain
// module has a reason to make it from somewhere else - see `withSession` below.
const getSchedules = async (domain, venues, requestJson) => {
  if (venues.length > MAX_THEATERS_PER_REQUEST) {
    throw probeError(
      `Asked for ${venues.length} theaters, over the ${MAX_THEATERS_PER_REQUEST} the endpoint silently truncates at`,
    );
  }

  const today = new Date();
  const params = new URLSearchParams({
    from: formatDate(startOfDay(today)),
    to: formatDate(endOfDay(addYears(today, 1))),
  });
  for (const { cinemaId } of venues) {
    params.append(
      "theaters",
      JSON.stringify({ id: cinemaId, timeZone: "Europe/London" }),
    );
  }

  const schedules = await requestJson(
    `${domain}/api/gatsby-source-boxofficeapi/schedule?${params}`,
  );
  if (!schedules || typeof schedules !== "object") {
    throw probeError("Schedule response was not an object keyed by theater");
  }
  return schedules;
};

// `schedule` is movie -> date -> showings, so a date's showings arrive split
// across every movie playing it and have to be summed rather than counted once.
const tally = ({ schedule }) => {
  const byDate = {};
  const films = new Set();

  for (const [movieId, dates] of Object.entries(schedule ?? {})) {
    for (const [date, showings] of Object.entries(dates ?? {})) {
      if (!showings?.length) continue;
      films.add(movieId);
      byDate[date] = (byDate[date] ?? 0) + showings.length;
    }
  }

  return { films, byDate };
};

const chunk = (items, size) =>
  items.reduce(
    (groups, item, index) =>
      index % size === 0
        ? [...groups, [item]]
        : [...groups.slice(0, -1), [...groups.at(-1), item]],
    [],
  );

// A chain whose API only answers a browser supplies `withSession`, which runs
// the call it is handed with a `requestJson` of its own. It wraps each chunk's
// call whole, so the challenge retry below gets a fresh session rather than
// being refused again by one that was already challenged.
const direct = (fn) => fn(probeJson);

async function health(venues, domain, { withSession = direct } = {}) {
  const { countRequest, reasonFor, finalise } = startObservation(GRANULARITY);

  const untracked = venues.filter(({ cinemaId }) => !cinemaId);
  if (untracked.length > 0) {
    // A chain declines the venues it knows aren't on this API before calling
    // in, so anything without an id here is a real gap in our attributes.
    throw new Error(
      `No cinemaId on ${untracked.map(({ id }) => id).join(", ")}; the schedule call is keyed on it`,
    );
  }

  const results = [];
  for (const group of chunk(venues, MAX_THEATERS_PER_REQUEST)) {
    let schedules;
    try {
      schedules = await withChallengeRetry(
        () =>
          withSession((requestJson) =>
            getSchedules(domain, group, requestJson),
          ),
        `theaters ${group.map(({ cinemaId }) => cinemaId).join(", ")}`,
      );
      countRequest();
    } catch (error) {
      // Only this chunk's venues share the failure; the others are still
      // observed on their own request.
      countRequest();
      const reason = reasonFor(error);
      results.push(...group.map(({ id }) => ({ venue: id, reason })));
      continue;
    }

    for (const { id, cinemaId } of group) {
      const schedule = schedules[cinemaId];
      if (!schedule) {
        // Present-but-empty is how the chain reports a venue with nothing on,
        // so absence from a chunk it was asked for means the id itself is
        // unknown.
        results.push({
          venue: id,
          reason: { kind: "unknown-venue-id", cinemaId },
        });
        continue;
      }

      const { films, byDate } = tally(schedule);
      const dates = Object.keys(byDate).sort();
      if (dates.length === 0) {
        results.push({ venue: id, reason: { kind: "no-listings-found" } });
        continue;
      }

      results.push({
        venue: id,
        counts: {
          performances: dates.reduce((total, d) => total + byDate[d], 0),
          films: films.size,
          dates: dates.length,
        },
        // Sorted so consecutive cycles diff cleanly.
        byDate: Object.fromEntries(dates.map((d) => [d, byDate[d]])),
      });
    }
  }

  return finalise(results);
}

module.exports = health;
