const {
  probeJson,
  probeError,
  startObservation,
  withChallengeRetry,
} = require("../health-probe");
const {
  signedPostOptions,
  apiUrlFor,
  getDatesQueryBody,
  getNowShowingQueryBody,
  getDatesFrom,
} = require("./utils");

// CineSync venues are separate cinemas on their own API subdomain that happen
// to run the same widget platform, not a chain with one listing call, so this is
// a per-venue probe each cinema module exports beside its `retrieve` and
// `transform`.
//
// The retrieve's cost is the fan-out: a performances call per date on sale, and
// at Lumiere Romford - which sells opera and ballet a year out - that is 256
// requests. This probe makes the two calls that come before the fan-out, the
// calendar's dates and the list of films on sale, and stops there.
//
// Which means it counts the two axes rather than their product, the way the
// Omniplex probe does and for the same reason: the per-date performance counts
// are the thing that costs a request each. A publish reads as either total
// growing.
const GRANULARITY = "film-and-date-totals";

// The calendar is capped at one page and says so only by coming back full - see
// the retrieve, which recovers the missing days by asking each film on sale for
// its own dates, at a request per film. That is the fan-out this probe exists
// to avoid, so a capped calendar is reported as the floor it is rather than as a
// count: `datesAtLeast` instead of `dates`, so a reader is told the number is
// short rather than left to assume Lumiere has exactly 100 days on sale forever.
const datesCount = (dates, perPage) =>
  dates.length >= perPage
    ? { datesAtLeast: dates.length }
    : { dates: dates.length };

async function health(venues) {
  const { countRequest, reasonFor, finalise } = startObservation(GRANULARITY);
  const [venue] = venues;
  const { apiKey, apiDomain, locationId } = venue;
  const apiUrl = apiUrlFor(apiDomain);

  const ask = (body) =>
    probeJson(apiUrl, signedPostOptions(apiKey, body));

  let dates;
  let perPage;
  let films;
  try {
    // Signed per call, and the signature is over a timestamp, so each request
    // is signed where it is made rather than once for the cycle.
    const datesPage = await withChallengeRetry(
      () => ask(getDatesQueryBody(locationId)),
      venue.id,
    );
    countRequest();

    // The cap is whatever the response says it is, so a change at the other end
    // is picked up rather than assumed away - the same reasoning as the
    // retrieve, which needs it to know when to go looking for the rest.
    perPage = datesPage.data?.per_page;
    if (!perPage) {
      throw probeError(
        "Calendar dates response is missing per_page - unable to tell whether the list of dates was capped",
      );
    }
    dates = [...new Set(getDatesFrom(datesPage))];

    // A stale location id is answered with an empty listing rather than a 404,
    // which is indistinguishable from a venue with nothing on - but each of
    // these venues has its own API subdomain, so an id that has gone takes the
    // host with it and arrives here as a probe error instead.
    const nowShowingPage = await withChallengeRetry(
      () => ask(getNowShowingQueryBody(locationId)),
      venue.id,
    );
    countRequest();

    const movies = nowShowingPage.data?.movies;
    if (!movies) {
      throw probeError("No films on sale returned by the now-showing list");
    }
    // The list is asked for with `has_limit: 0`, which does turn paging off
    // here - but say so if that ever stops being true rather than reporting one
    // page as the whole catalogue.
    if (nowShowingPage.data.total_pages > 1) {
      throw probeError(
        `The now-showing list spans ${nowShowingPage.data.total_pages} pages - only the first is read`,
      );
    }
    films = movies.length;
  } catch (error) {
    return finalise([{ venue: venue.id, reason: reasonFor(error) }]);
  }

  if (films === 0 && dates.length === 0) {
    return finalise([
      { venue: venue.id, reason: { kind: "no-listings-found" } },
    ]);
  }

  return finalise([
    {
      venue: venue.id,
      counts: { films, ...datesCount(dates, perPage) },
      // No `byDate`: building one would mean the per-date fan-out this probe
      // exists to skip, and one built from the dates alone would carry no
      // counts. See the Omniplex probe, which reports the same shape.
    },
  ]);
}

module.exports = health;
