const { probeError, probeJson, startObservation } = require("../health-probe");

// Shared by every chain on this API the way `retrieve.js` here is: the chain
// module supplies a `getApi` that bootstraps the bearer token off its own site,
// and everything after that is identical.
//
// `film-screening-dates` takes `siteIds` repeated - comma-separating them is a
// 400 - and answers for the whole estate in one response, each film screening
// carrying the sites it plays at. It is the call a retrieve makes first, before
// fanning out to a showtimes request per date. What it does not carry is a
// performance count; `showtimes/by-business-date` does, at a request per date,
// which is the cost this probe exists to avoid.
const GRANULARITY = "film-date";

const authHeaders = (authToken) => ({
  headers: {
    Accept: "application/json",
    authorization: `Bearer ${authToken}`,
  },
});

// The chain's own list of what it operates, fetched before the listing call.
// A site with nothing on simply doesn't appear in `film-screening-dates`, so
// that response alone can't tell a dark venue from an id that has stopped
// existing. And an unrecognised `siteIds` 400s the *whole* request rather than
// omitting one site, so without this a single stale id would blind the probe
// for the entire estate instead of costing one venue-missing row.
const getSiteIds = async ({ url, apiUrl, authToken }) => {
  const { sites } = await probeJson(
    `${url || apiUrl}/ocapi/v1/sites`,
    authHeaders(authToken),
  );
  if (!Array.isArray(sites)) {
    throw probeError("Site list did not contain a `sites` array");
  }
  return new Set(sites.map((site) => site.id));
};

const getFilmScreeningDates = async ({ url, apiUrl, authToken }, venues) => {
  const siteIds = venues
    .map(({ cinemaId }) => `siteIds=${encodeURIComponent(cinemaId)}`)
    .join("&");
  const { filmScreeningDates } = await probeJson(
    `${url || apiUrl}/ocapi/v1/film-screening-dates?${siteIds}`,
    authHeaders(authToken),
  );
  if (!Array.isArray(filmScreeningDates)) {
    throw probeError("Listing did not contain a `filmScreeningDates` array");
  }
  return filmScreeningDates;
};

// One tally per tracked site. Films are a set because the same film recurs on
// every date it plays, while a film-date pair is counted once per date - that
// pair is the unit `byDate` reports, so the two agree by construction.
const tallyByVenue = (filmScreeningDates, venues) => {
  const tallies = new Map(
    venues.map(({ cinemaId }) => [cinemaId, { films: new Set(), byDate: {} }]),
  );

  for (const { businessDate, filmScreenings = [] } of filmScreeningDates) {
    for (const { filmId, sites = [] } of filmScreenings) {
      for (const { siteId } of sites) {
        const tally = tallies.get(siteId);
        // The estate we track is a subset of the chain's sites; one we didn't
        // ask about arriving here is the API being generous, not an error.
        if (!tally) continue;
        tally.films.add(filmId);
        tally.byDate[businessDate] = (tally.byDate[businessDate] ?? 0) + 1;
      }
    }
  }

  return tallies;
};

async function health(venues, getApi) {
  const { countRequest, reasonFor, finalise } = startObservation(GRANULARITY);

  const untracked = venues.filter(({ cinemaId }) => !cinemaId);
  if (untracked.length > 0) {
    // Not a probe result - the batched call can't be built at all, and guessing
    // an id would put an invented one into a request.
    throw new Error(
      `No cinemaId on ${untracked.map(({ id }) => id).join(", ")}; the batched listing call is keyed on it`,
    );
  }

  let tracked = [];
  let missing = [];
  let tallies;
  try {
    const api = await getApi();
    const knownSiteIds = await getSiteIds(api);
    countRequest();

    tracked = venues.filter(({ cinemaId }) => knownSiteIds.has(cinemaId));
    missing = venues.filter(({ cinemaId }) => !knownSiteIds.has(cinemaId));

    // Skip the listing call rather than send an empty `siteIds`, which is a
    // different question with a different answer.
    if (tracked.length) {
      tallies = tallyByVenue(
        await getFilmScreeningDates(api, tracked),
        tracked,
      );
      countRequest();
    } else {
      tallies = new Map();
    }
  } catch (error) {
    // Every venue shares the failure because they shared the call.
    const reason = reasonFor(error);
    return finalise(venues.map(({ id }) => ({ venue: id, reason })));
  }

  const missingIds = new Set(missing.map(({ id }) => id));

  return finalise(
    venues.map(({ id, cinemaId }) => {
      if (missingIds.has(id)) {
        return { venue: id, reason: { kind: "venue-missing", cinemaId } };
      }

      const { films, byDate } = tallies.get(cinemaId);
      const dates = Object.keys(byDate).sort();
      if (dates.length === 0) {
        return { venue: id, reason: { kind: "venue-dark" } };
      }

      return {
        venue: id,
        counts: {
          films: films.size,
          dates: dates.length,
          filmDatePairs: dates.reduce((total, date) => total + byDate[date], 0),
        },
        // Sorted so consecutive cycles diff cleanly.
        byDate: Object.fromEntries(dates.map((date) => [date, byDate[date]])),
      };
    }),
  );
}

module.exports = health;
