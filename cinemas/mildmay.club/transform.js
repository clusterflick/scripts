const sourceOnlyTransform = require("../../common/source-only/transform");
const { isFilmEvent } = require("../../common/is-film-event");

// The Mildmay is a members' social club whose programme is almost entirely not
// film - Zumba classes, a weekly jazz club, choir, book club, board games -
// with the occasional screening among it. The sources covering it report all of
// that, so the listing has to say for itself that a film is being shown.
//
// Applied here rather than in `common/source-only/transform.js`: most
// source-only venues are film clubs and pop-ups whose listings are just the
// film's name, and filtering them the same way would drop data.
const isFilmListing = ({ title, matchingHints }) =>
  isFilmEvent(`${title} ${matchingHints?.overview || ""}`);

async function transform(data, sourcedEvents) {
  const events = await sourceOnlyTransform(data, sourcedEvents);
  return events.filter(isFilmListing);
}

module.exports = transform;
