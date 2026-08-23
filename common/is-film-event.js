const { basicNormalize } = require("./utils");

// A venue that isn't a cinema - a theatre, a concert hall, a museum - lists the
// occasional film alongside everything else, and often tags nothing as film.
// Where the venue's own listing carries no category to filter on, the listing
// has to say for itself that a film is being shown.
//
// This is the counterpart to `is-non-film-event.js`: that one names specific
// events we know aren't films, this one asks whether a listing looks like a
// film at all. Use it only for venues whose programme is mostly not film - a
// cinema's listings need no such test, and applying one there would drop films
// whose blurb happens not to use any of these words.
//
// ONE list, deliberately, rather than a base list plus per-venue additions. A
// phrase learned at one venue is a phrase every venue benefits from, and
// keeping them scoped to where they were first seen would mean missing the
// same wording somewhere else. The list is allowed to run slightly loose
// because the two failure modes are not symmetric: a false positive is passed
// on to categorisation, which sends it back as a talk or a gig and no film is
// invented, while a false negative silently drops a real screening with
// nothing downstream to catch it.
const FILM_KEYWORDS = [
  "film club",
  "film screening",
  "screening",
  "short films",
  "cinema",
  "cineclub",
  "cine club",
  "classic film",
  "film duration",
  // Films programmed around a live score are described by what happens on
  // screen rather than as a "screening"
  "on screen",
  "the film",
];

/**
 * Does this listing say a film is being shown?
 * @param {string} text - The listing's title and description together; a
 *   description-only match is enough, since venues rarely put "screening" in
 *   the title of a film they're showing
 * @returns {boolean} True if any keyword appears
 */
const isFilmEvent = (text) => {
  const haystack = basicNormalize(text);
  return FILM_KEYWORDS.some((keyword) => haystack.includes(keyword));
};

module.exports = { FILM_KEYWORDS, isFilmEvent };
