const { withPlaywrightSession } = require("../get-page-with-playwright");
const {
  probeJson,
  probeError,
  classifyPage,
  startObservation,
} = require("../health-probe");

// One browser page load plus a request per venue.
//
// The listings API answers 401 to a plain fetch, so the calls have to be made
// from inside a page. The session it needs is origin-scoped rather than
// venue-scoped, though, so a single page load serves the whole estate - verified
// by fetching all 15 cinemas off one Islington page, every one a 200.
//
// Sessions carry a timestamp, so this reports real performance counts.
const GRANULARITY = "performance";

const DOMAIN = "https://www.myvue.com";
const filmsUrl = (cinemaId) =>
  `${DOMAIN}/api/microservice/showings/cinemas/${cinemaId}/films?minEmbargoLevel=1&includesSession=true&includeSessionAttributes=true`;

// The chain's own cinema list, and the one call here that needs no browser.
// It is load-bearing: an unrecognised cinemaId answers 200 with `responseCode: 0`
// and an empty film list - identical to a venue with nothing on - so without
// this a stale id would report as dark and look truthful.
const getKnownCinemaIds = async () => {
  const { result } = await probeJson(
    `${DOMAIN}/api/microservice/showings/cinemas`,
  );
  if (!Array.isArray(result)) {
    throw probeError("Cinema list did not contain a `result` array");
  }
  return new Set(
    result.flatMap(({ cinemas = [] }) => cinemas.map((c) => c.cinemaId)),
  );
};

// Tallied inside the page rather than out. Fifteen venues of full film data is
// several megabytes to serialise back across the bridge, and all that is wanted
// from it is counts per date.
const tallyInPage = async (page, cinemaIds) =>
  page.evaluate(
    async ({ cinemaIds, urlTemplate }) => {
      const results = [];
      for (const cinemaId of cinemaIds) {
        const url = urlTemplate.replace("CINEMA_ID", cinemaId);
        try {
          const response = await fetch(url);
          const data = await response.json();
          if (!response.ok || data.responseCode !== 0 || !data.result) {
            results.push({
              cinemaId,
              error: `responded ${response.status} with responseCode ${data?.responseCode}`,
            });
            continue;
          }
          const films = new Set();
          const byDate = {};
          for (const film of data.result) {
            for (const group of film.showingGroups ?? []) {
              for (const session of group.sessions ?? []) {
                films.add(film.id ?? film.filmId ?? film.title);
                const date = String(session.showTimeWithTimeZone).slice(0, 10);
                byDate[date] = (byDate[date] ?? 0) + 1;
              }
            }
          }
          results.push({ cinemaId, films: films.size, byDate });
        } catch (error) {
          results.push({ cinemaId, error: error.message });
        }
      }
      return results;
    },
    { cinemaIds, urlTemplate: filmsUrl("CINEMA_ID") },
  );

async function health(venues) {
  const { countRequest, reasonFor, finalise } = startObservation(GRANULARITY);

  let knownCinemaIds;
  try {
    knownCinemaIds = await getKnownCinemaIds();
    countRequest();
  } catch (error) {
    // The chain check is shared, so its failure is shared. Reporting every
    // venue as dark would be worse than reporting that we couldn't look.
    const reason = reasonFor(error);
    return finalise(venues.map(({ id }) => ({ venue: id, reason })));
  }

  const tracked = venues.filter(({ cinemaId }) => knownCinemaIds.has(cinemaId));

  let tallies = new Map();
  if (tracked.length > 0) {
    try {
      const results = await withPlaywrightSession((getPage) =>
        getPage(
          venues[0].url,
          // Its own key, so the probe never shares - or poisons - the
          // retrieve's cache entries (`myvue.com-<cinemaId>`).
          "health--myvue.com",
          async (page, response) => {
            await page.waitForLoadState();
            // The header is what tells us a real page rendered rather than an
            // interstitial, so a failure to find it is classified, not thrown.
            const header = page.locator(".header__box");
            if (!(await header.count())) {
              await header.waitFor().catch(() => {});
            }
            if (!(await header.count())) {
              return classifyPage(
                page,
                response,
                `No page shell on ${venues[0].url}`,
              );
            }
            return tallyInPage(
              page,
              tracked.map(({ cinemaId }) => cinemaId),
            );
          },
          // An hourly probe must not replay an earlier cycle's page.
          { disableCache: true },
        ),
      );
      for (const result of results) {
        countRequest();
        tallies.set(result.cinemaId, result);
      }
    } catch (error) {
      // The page load is shared by every venue, so its failure is too. A
      // per-venue request that failed is reported against that venue instead,
      // by `tallyInPage`.
      const reason = reasonFor(error);
      return finalise(venues.map(({ id }) => ({ venue: id, reason })));
    }
  }

  return finalise(
    venues.map(({ id, cinemaId }) => {
      if (!knownCinemaIds.has(cinemaId)) {
        return { venue: id, reason: { kind: "venue-missing", cinemaId } };
      }

      const tally = tallies.get(cinemaId);
      if (tally?.error) {
        return {
          venue: id,
          reason: { kind: "probe-error", message: tally.error },
        };
      }

      const byDate = tally?.byDate ?? {};
      const dates = Object.keys(byDate).sort();
      if (dates.length === 0) {
        return { venue: id, reason: { kind: "venue-dark" } };
      }

      return {
        venue: id,
        counts: {
          performances: dates.reduce((total, d) => total + byDate[d], 0),
          films: tally.films,
          dates: dates.length,
        },
        // Sorted so consecutive cycles diff cleanly.
        byDate: Object.fromEntries(dates.map((d) => [d, byDate[d]])),
      };
    }),
  );
}

module.exports = health;
