const attributes = require("./attributes");

// A venue's own listing and the festival's book the same screening at a time
// each writes down for itself, and they don't always agree: the Prince Charles
// lists screenings of the London Film Festival 15-20 minutes before the
// festival does. Only screenings already tied to one film are compared, and two
// screenings of one film at one venue within the hour aren't a thing, so the
// window can be generous.
const SAME_SCREENING_WINDOW_MS = 60 * 60 * 1000;

/**
 * The BFI festival films a link identifies. The BFI names a film two ways - by
 * the permalink in its page address, and by the article id in its booking
 * links - and venues use either, so both are read. Matched anywhere in the
 * string rather than parsed as a URL, as the ICA has published the link with
 * its own domain still in front of it.
 */
function getFestivalFilmIds(url) {
  if (!url) return [];
  const ids = [];
  const permalink = url.match(
    /whatson\.bfi\.org\.uk\/\w+\/Online\/(?:article\/|default\.asp\?BOparam::WScontent::loadArticle::permalink=)([\w-]+)/i,
  )?.[1];
  if (permalink) ids.push(`permalink:${permalink.toLowerCase()}`);
  const articleId = url.match(
    /whatson\.bfi\.org\.uk\/\w+\/Online\/.*loadArticle::article_id=([0-9A-F-]+)/i,
  )?.[1];
  if (articleId) ids.push(`article:${articleId.toUpperCase()}`);
  return ids;
}

/**
 * Remove the festival screenings a venue already lists itself, leaving any the
 * venue doesn't. A venue that sells its festival screenings links each one to
 * the festival's page for the film, so a screening is the venue's own when that
 * film's link is on one of its listings and the venue has a screening of it at
 * about the same time.
 * @param {Array} movies - The venue's own listings
 * @param {Object} sourcedEvents - Events found by each source, keyed by source id
 * @returns {Object} sourcedEvents, with the festival's already-listed screenings removed
 */
function withoutScreeningsListedByVenue(movies, sourcedEvents) {
  const festivalEvents = sourcedEvents[attributes.id];
  if (!festivalEvents) return sourcedEvents;

  const listedTimesByFilm = new Map();
  for (const movie of movies) {
    for (const performance of movie.performances) {
      const ids = new Set([
        ...getFestivalFilmIds(movie.url),
        ...getFestivalFilmIds(performance.bookingUrl),
      ]);
      for (const id of ids) {
        if (!listedTimesByFilm.has(id)) listedTimesByFilm.set(id, []);
        listedTimesByFilm.get(id).push(performance.time);
      }
    }
  }

  const unlistedEvents = festivalEvents
    .map((event) => {
      const listedTimes = [
        ...getFestivalFilmIds(event.url),
        ...event.performances.flatMap(({ bookingUrl }) =>
          getFestivalFilmIds(bookingUrl),
        ),
      ].flatMap((id) => listedTimesByFilm.get(id) ?? []);

      const performances = event.performances.filter(
        ({ time }) =>
          !listedTimes.some(
            (listedTime) =>
              Math.abs(listedTime - time) <= SAME_SCREENING_WINDOW_MS,
          ),
      );
      return { ...event, performances };
    })
    .filter(({ performances }) => performances.length > 0);

  return { ...sourcedEvents, [attributes.id]: unlistedEvents };
}

module.exports = withoutScreeningsListedByVenue;
