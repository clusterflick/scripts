const {
  probeJson,
  probeText,
  probeError,
  startObservation,
  withChallengeRetry,
} = require("../health-probe");

// One request a venue plus one chain check; Cineworld has no multi-cinema call.
//
// `as-at-date` is not a window on showings. It is an exclusive lower bound on
// each film's `releaseDate`, and `releaseDate` is when that title opens at
// Cineworld rather than when the picture came out - "Casino (1995)" carries
// 2026-08-25. So the endpoint answers "what has yet to open": the site passes
// today and gets pre-orders, while a floor before cinema gets the whole
// listing. Verified film-for-film against `film-events/.../at-date/`, which is
// the only alternative and costs a request per venue per date.
//
// Do not add the site's `noAttr` filter - it drops the event, live and theatre
// screenings we track (at Enfield, 65 films over 52 dates down to 46 over 28).
const GRANULARITY = "film-date";

const API_URL = "https://www.cineworld.co.uk/uk/data-api-service/v1";
const TENANT_ID = "10108";

// Before cinema, so nothing can fall below it. No recent value is safe: Wood
// Green lists a title dated 2013-02-01, and even a 2025 floor quietly drops
// about two films at every venue. Depth is free - the parameter is a real
// `java.time.LocalDate` (per the server's own 400), not a timestamp clamped at
// the epoch, so a pre-1970 floor means what it says.
const RELEASE_FLOOR = "1870-01-01";

// The chain's own site list, off the homepage - the same parse
// data-analysed's check-cineworld-ids.js uses. Load-bearing in a way Odeon's
// isn't: an unrecognised Odeon id makes the listing call 400, an unrecognised
// Cineworld one answers 200 with an empty matrix, which is exactly what a venue
// with nothing on returns. Without it a stale id reports as no-listings-found
// and looks truthful.
const getKnownCinemaIds = async () => {
  const html = await probeText("https://www.cineworld.co.uk/");
  const match = html.match(/apiSitesList\s*=\s*(\[[^\]]+\]),/i);
  if (!match) {
    throw probeError("No apiSitesList in the Cineworld homepage");
  }
  return new Set(JSON.parse(match[1]).map(({ externalCode }) => externalCode));
};

const getFilmDates = async (cinemaId) => {
  const { body } = await probeJson(
    `${API_URL}/quickbook/${TENANT_ID}/film-events-dates/in-cinema/${cinemaId}/as-at-date/${RELEASE_FLOOR}?attr=&lang=en_GB`,
  );
  if (
    !body?.eventsDatesByFilmId ||
    typeof body.eventsDatesByFilmId !== "object"
  ) {
    throw probeError("Listing did not contain an `eventsDatesByFilmId` map");
  }
  return body.eventsDatesByFilmId;
};

// Films per date - the same axis the OCAPI chains report, so a publish reads the
// same way everywhere: new keys appearing, or existing keys growing.
const tallyByDate = (eventsDatesByFilmId) => {
  const byDate = {};
  for (const dates of Object.values(eventsDatesByFilmId)) {
    for (const date of dates) byDate[date] = (byDate[date] ?? 0) + 1;
  }
  return byDate;
};

async function health(venues) {
  const { countRequest, reasonFor, finalise } = startObservation(GRANULARITY);

  let knownCinemaIds;
  try {
    knownCinemaIds = await withChallengeRetry(
      getKnownCinemaIds,
      "the chain site list",
    );
    countRequest();
  } catch (error) {
    // The chain check is the one shared call, so its failure is shared too.
    // Reporting every venue as having no listings would be worse than saying we
    // couldn't look.
    const reason = reasonFor(error);
    return finalise(venues.map(({ id }) => ({ venue: id, reason })));
  }

  const results = [];
  for (const { id, cinemaId } of venues) {
    if (!knownCinemaIds.has(cinemaId)) {
      // No request: the chain says it doesn't operate this site, and asking
      // anyway would answer 200-with-nothing and read as no listings.
      results.push({
        venue: id,
        reason: { kind: "unknown-venue-id", cinemaId },
      });
      continue;
    }

    let filmDates;
    try {
      filmDates = await withChallengeRetry(() => getFilmDates(cinemaId), id);
      countRequest();
    } catch (error) {
      // One venue's own request, so the failure stays with that venue and the
      // rest of the estate is still observed.
      countRequest();
      results.push({ venue: id, reason: reasonFor(error) });
      continue;
    }

    const byDate = tallyByDate(filmDates);
    const dates = Object.keys(byDate).sort();
    if (dates.length === 0) {
      results.push({ venue: id, reason: { kind: "no-listings-found" } });
      continue;
    }

    results.push({
      venue: id,
      counts: {
        films: Object.keys(filmDates).length,
        dates: dates.length,
        filmDatePairs: dates.reduce((total, date) => total + byDate[date], 0),
      },
      // Sorted so consecutive cycles diff cleanly.
      byDate: Object.fromEntries(dates.map((date) => [date, byDate[date]])),
    });
  }

  return finalise(results);
}

module.exports = health;
