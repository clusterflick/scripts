const sourceOnlyTransform = require("../../common/source-only/transform");
const { isFilmEvent } = require("../../common/is-film-event");

// Staffordshire St is an artists' studios and exhibition space whose programme
// is mostly not film - exhibition openings, word club, life drawing, folk
// nights, open studios - with the STST Film Club running among it. The sources
// covering it report all of that, so the listing has to say for itself that a
// film is being shown.
//
// Applied here rather than in `common/source-only/transform.js` for the reason
// given at cinemas/mildmay.club/transform.js: most source-only venues are film
// clubs and pop-ups whose listings are just the film's name.
const isFilmListing = ({ title, matchingHints }) =>
  isFilmEvent(`${title} ${matchingHints?.overview || ""}`);

async function transform(data, sourcedEvents) {
  const events = await sourceOnlyTransform(data, sourcedEvents);
  return events.filter(isFilmListing);
}

module.exports = transform;
