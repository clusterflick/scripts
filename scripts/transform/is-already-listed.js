const { getBookingHost } = require("../../common/utils");

/**
 * Is a movie from the previous release a copy of one this run already holds?
 *
 * Venues hand booking for some screenings to the organiser running them, and
 * the source covering that organiser finds the same screening — so the venue
 * transforms drop the sourced copy via `removeAlreadyListedPerformances`. Once
 * dropped, though, recovery sees a movie that was in the previous release and
 * isn't in this one, finds the organiser's page still up, and puts it straight
 * back. The copy then seeds the next release's baseline with itself and returns
 * every run.
 *
 * Recognise the copy the same way the venue transforms do: every future
 * performance shares a time and a booking host with one we already hold. A
 * booking URL we can't read a host from identifies nothing, so it never
 * matches — the same rule `removeAlreadyListedPerformances` applies.
 */
const isAlreadyListed = (futurePerformances, matchedData) =>
  futurePerformances.every(({ time, bookingUrl }) => {
    const host = getBookingHost(bookingUrl);
    if (!host) return false;
    return matchedData.some(({ performances }) =>
      performances.some(
        (performance) =>
          performance.time === time &&
          getBookingHost(performance.bookingUrl) === host,
      ),
    );
  });

module.exports = isAlreadyListed;
