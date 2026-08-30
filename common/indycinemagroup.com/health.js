const { format, isBefore, parseISO, startOfDay } = require("date-fns");
const { isPrivateHire } = require("../utils");
const {
  probeJson,
  probeError,
  startObservation,
  withChallengeRetry,
} = require("../health-probe");
const { listingRequest } = require("./utils");

// IndyCinemaGroup venues are separate cinemas on the same platform, each behind
// its own `site_id` cookie rather than a site id in a shared response, so one
// call cannot answer for all three: this is a per-venue probe each cinema module
// exports beside its `retrieve` and `transform`.
//
// Unlike the other probes this one saves no requests - the retrieve is already a
// single GraphQL call. What it saves is the response: the retrieve asks for
// synopses, cast lists, images and metadata for every film, and this asks for
// showtimes, which is 15KB against several hundred. It is here for the
// observation rather than the saving, the same reason the Prince Charles probe
// is - what it avoids is the transform, not the request.
const GRANULARITY = "performance";

// The retrieve's query with everything but the counting dropped.
const query = `
query ($limit: Int, $orderBy: String, $type: String) {
  movies(
    limit: $limit
    orderBy: $orderBy
    type: $type
  ) {
    data {
      id
      name

      showings {
        id
        time
      }
    }
  }
}
`;

// The listing is asked for as `all-published`, which is the whole archive: ActOne
// One answers with showings going back to 2024. Only today onwards is counted,
// for the same reason every other probe counts a what's-on page - a date that
// has passed can never grow, so it is not a publish signal, and a byDate full of
// dead keys would leave a venue whose programme had emptied still reporting two
// hundred dates and looking healthy.
const tally = (movies, today) => {
  const films = new Set();
  const byDate = {};
  const unparsed = [];

  for (const movie of movies) {
    // Private hires are bookings of the screen, not screenings; the transform
    // drops them, so counting them here would report listings we never publish.
    if (isPrivateHire(movie.name)) continue;

    // Duplicate showings at the same time are one showing - an invalid one left
    // in and replaced - and the transform keeps only the last of them. Counting
    // both here would report a showing the listings never carry.
    for (const time of new Set(movie.showings.map(({ time }) => time))) {
      // `time` carries a zone ("2026-08-28T11:10:00Z"), so the date it falls on
      // is the one the transform publishes it under rather than the one its
      // first ten characters spell - a late showing is the next day in UTC.
      const date = parseISO(time ?? "");
      if (isNaN(date.getTime())) {
        unparsed.push(time ?? "(no time)");
        continue;
      }
      if (isBefore(date, today)) continue;

      const day = format(date, "yyyy-MM-dd");
      byDate[day] = (byDate[day] ?? 0) + 1;
      // The movie id rather than the title, which is what the transform builds
      // its showing id from too.
      films.add(movie.id);
    }
  }

  if (unparsed.length > 0) {
    throw probeError(
      `${unparsed.length} showing(s) had an unreadable time (e.g. "${unparsed[0]}")`,
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
    const response = await withChallengeRetry(
      () => probeJson(...listingRequest(venue, query)),
      venue.id,
    );
    countRequest();

    // A GraphQL endpoint answers a rejected query with a 200 and an `errors`
    // list, so a schema change here arrives looking like a success.
    if (response.errors) {
      throw probeError(
        `The listing query was rejected: ${response.errors
          .map(({ message }) => message)
          .join("; ")}`,
      );
    }
    const movies = response.data?.movies?.data;
    if (!movies) {
      throw probeError("The listing response carries no movies");
    }

    ({ films, byDate } = tally(movies, startOfDay(new Date())));
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
