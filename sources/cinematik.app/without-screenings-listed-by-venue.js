const attributes = require("./attributes");

// Where Cinematik only links out to a venue's box office, it usually links the
// address the venue's own listing gives the screening, and the two copies are
// told apart by removeAlreadyListedPerformances matching it exactly. Some
// venues' listings link a different page for the same screening, and for
// those the link has to be read for what it names.
//
// A cinesync venue's listing links each screening's seat plan -
// "/movies/marie-antoinette/showtimes/2026-11-24/romford/seat-plan?showtime=…"
// - while Cinematik links the film's showtimes for that day -
// "/movies/marie-antoinette/showtimes/2026-11-24?location=romford". Both name
// the film and the date, and the start time says which of the day's screenings
// it is, so the three together are the screening, with no title to compare.
// Two films at one time stay apart, as each link names its own film.
const getCinesyncScreening = (bookingUrl) => {
  let url;
  try {
    url = new URL(bookingUrl);
  } catch {
    return undefined;
  }
  const [, film, date] =
    url.pathname.match(
      /^\/movies\/([^/]+)\/showtimes\/(\d{4}-\d{2}-\d{2})\b/,
    ) ?? [];
  return film ? `${url.host}|${film}|${date}` : undefined;
};

/**
 * Remove the Cinematik screenings a cinesync venue already lists itself,
 * leaving any the venue doesn't.
 * @param {Array} movies - The venue's own listings
 * @param {Object} sourcedEvents - Events found by each source, keyed by source id
 * @returns {Object} sourcedEvents, with Cinematik's already-listed screenings removed
 */
function withoutScreeningsListedByVenue(movies, sourcedEvents) {
  const cinematikEvents = sourcedEvents[attributes.id];
  if (!cinematikEvents) return sourcedEvents;

  const listed = new Set(
    movies.flatMap(({ performances }) =>
      performances.map(({ time, bookingUrl }) => {
        const screening = getCinesyncScreening(bookingUrl);
        return screening && `${screening}|${time}`;
      }),
    ),
  );
  listed.delete(undefined);

  const unlistedEvents = cinematikEvents
    .map((event) => ({
      ...event,
      performances: event.performances.filter(({ time, bookingUrl }) => {
        const screening = getCinesyncScreening(bookingUrl);
        return !(screening && listed.has(`${screening}|${time}`));
      }),
    }))
    .filter(({ performances }) => performances.length > 0);

  return { ...sourcedEvents, [attributes.id]: unlistedEvents };
}

module.exports = withoutScreeningsListedByVenue;
