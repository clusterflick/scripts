const {
  probeJson,
  probeError,
  startObservation,
  withChallengeRetry,
} = require("../health-probe");

// One request for the whole estate, no browser and no second call.
//
// `data/data.json` is the same document `retrieve.js` here reads, and it is
// already the entire chain: every cinema, every film and every screening. The
// retrieve fetches it once per venue because a retrieve runs per venue; the
// probe fetches it once for both.
//
// Screenings are individual showings carrying their own date, time and cinema,
// so this reports real performance counts rather than a film x date matrix.
const GRANULARITY = "performance";

// The chain's own list of what it operates. The screenings alone can't tell a
// venue with nothing on from an id that has stopped existing - both are simply
// an id that never appears - and `cinemas` is the document's own answer to that.
const getSite = async (domain) => {
  const site = await probeJson(`${domain}/data/data.json`);
  if (!site?.cinemas || typeof site.cinemas !== "object") {
    throw probeError("Listing did not contain a `cinemas` object");
  }
  if (!site.screenings || typeof site.screenings !== "object") {
    throw probeError("Listing did not contain a `screenings` object");
  }
  return site;
};

// One tally per tracked site. `screenings` is keyed by screening id with each
// value naming its `cinema`, so partitioning it is the whole job - the same
// numbers the transform arrives at through `films[].screenings.byCinema`.
const tallyByVenue = (screenings, venues) => {
  const tallies = new Map(
    venues.map(({ cinemaId }) => [cinemaId, { films: new Set(), byDate: {} }]),
  );

  for (const { cinema, film, d: date } of Object.values(screenings)) {
    const tally = tallies.get(cinema);
    // The chain is bigger than the estate we track; a screening at a cinema we
    // didn't ask about is not an error.
    if (!tally) continue;
    tally.films.add(film);
    tally.byDate[date] = (tally.byDate[date] ?? 0) + 1;
  }

  return tallies;
};

async function health(venues) {
  const { countRequest, reasonFor, finalise } = startObservation(GRANULARITY);

  const untracked = venues.filter(({ cinemaId }) => !cinemaId);
  if (untracked.length > 0) {
    // Not a probe result - without an id there is no way to tell one venue's
    // screenings from the other's, and guessing one would invent an id.
    throw new Error(
      `No cinemaId on ${untracked.map(({ id }) => id).join(", ")}; the listing is partitioned on it`,
    );
  }

  let site;
  try {
    site = await withChallengeRetry(
      () => getSite(venues[0].domain),
      "the chain listing",
    );
    countRequest();
  } catch (error) {
    // Every venue shares the failure because they shared the one call.
    countRequest();
    const reason = reasonFor(error);
    return finalise(venues.map(({ id }) => ({ venue: id, reason })));
  }

  const tallies = tallyByVenue(site.screenings, venues);

  return finalise(
    venues.map(({ id, cinemaId }) => {
      if (!site.cinemas[cinemaId]) {
        return { venue: id, reason: { kind: "unknown-venue-id", cinemaId } };
      }

      const { films, byDate } = tallies.get(cinemaId);
      const dates = Object.keys(byDate).sort();
      if (dates.length === 0) {
        return { venue: id, reason: { kind: "no-listings-found" } };
      }

      return {
        venue: id,
        counts: {
          performances: dates.reduce((total, date) => total + byDate[date], 0),
          films: films.size,
          dates: dates.length,
        },
        // Sorted so consecutive cycles diff cleanly.
        byDate: Object.fromEntries(dates.map((date) => [date, byDate[date]])),
      };
    }),
  );
}

module.exports = health;
