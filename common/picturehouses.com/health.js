const {
  probeJson,
  probeDocument,
  probeError,
  startObservation,
} = require("../health-probe");

// Three requests for the whole estate, no browser.
//
// `get-movies-ajax` ignores the `cinema_id` it is given: it answers with every
// cinema in the chain and each showing carries its own `CinemaId`, so one call
// partitions across all our venues. Verified by asking for three different
// cinemas - the session sets came back identical. The response is large (~4MB)
// because it is the entire chain's listings, which is the trade for one request.
//
// Showings are individual performances with a timestamp, so unlike the OCAPI
// chains this reports real performance counts rather than a film x date matrix.
const GRANULARITY = "performance";

const DOMAIN = "https://www.picturehouses.com";

// The cinema list is a CSRF-protected POST, but the token and session cookie can
// both be read straight off the homepage HTML - no browser needed, unlike
// data-analysed's check-picturehouse-ids.js which drives one. Without the list a
// venue absent from the listings can't be told from an id that has gone stale,
// and Picturehouse gives no other signal: the movies call never sees our ids.
const getKnownCinemaIds = async () => {
  const { body: html, cookie } = await probeDocument(DOMAIN);

  const token = html.match(/name="_token"\s+value="([^"]+)"/)?.[1];
  if (!token) throw probeError("No _token on the Picturehouse homepage");

  const { cinema_list: cinemaList } = await probeJson(
    `${DOMAIN}/ajax-cinema-list`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ _token: token }),
    },
  );
  if (!Array.isArray(cinemaList)) {
    throw probeError("Cinema list did not contain a `cinema_list` array");
  }
  return new Set(cinemaList.map(({ cinema_id: id }) => id));
};

// `cinemaId` is any tracked venue's. The endpoint does not filter on it - the
// response is the same chain-wide listing whichever is sent - but it is required:
// an empty one answers 200 with no `movies` key at all.
const getShowTimes = async (cinemaId) => {
  const { movies } = await probeJson(`${DOMAIN}/api/get-movies-ajax`, {
    method: "POST",
    body: new URLSearchParams({
      start_date: "show_all_dates",
      cinema_id: cinemaId,
    }).toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
  });
  if (!Array.isArray(movies)) {
    throw probeError("Listing did not contain a `movies` array");
  }
  return movies;
};

// One tally per tracked cinema. Films are a set because a film recurs across
// every showing of it; performances are counted one per showing.
const tallyByVenue = (movies, venues) => {
  const tallies = new Map(
    venues.map(({ cinemaId }) => [cinemaId, { films: new Set(), byDate: {} }]),
  );

  for (const movie of movies) {
    for (const { CinemaId, Showtime } of movie.show_times ?? []) {
      const tally = tallies.get(CinemaId);
      // The estate we track is a subset of the chain; other cinemas arriving
      // here is the endpoint answering chain-wide, not an error.
      if (!tally) continue;
      tally.films.add(movie.ScheduledFilmId);
      const date = Showtime.slice(0, 10);
      tally.byDate[date] = (tally.byDate[date] ?? 0) + 1;
    }
  }

  return tallies;
};

async function health(venues) {
  const { countRequest, reasonFor, finalise } = startObservation(GRANULARITY);

  let knownCinemaIds;
  let tallies;
  try {
    knownCinemaIds = await getKnownCinemaIds();
    countRequest();
    countRequest();
    tallies = tallyByVenue(await getShowTimes(venues[0].cinemaId), venues);
    countRequest();
  } catch (error) {
    // One call answers for every venue, so they share its failure.
    const reason = reasonFor(error);
    return finalise(venues.map(({ id }) => ({ venue: id, reason })));
  }

  return finalise(
    venues.map(({ id, cinemaId }) => {
      if (!knownCinemaIds.has(cinemaId)) {
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
          performances: dates.reduce((total, d) => total + byDate[d], 0),
          films: films.size,
          dates: dates.length,
        },
        // Sorted so consecutive cycles diff cleanly.
        byDate: Object.fromEntries(dates.map((d) => [d, byDate[d]])),
      };
    }),
  );
}

module.exports = health;
