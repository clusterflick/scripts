const sourceOnlyTransform = require("./transform");
const { isFilmEvent } = require("../is-film-event");

// The source-only transform for a venue whose programme is mostly *not* film -
// a members' club, a co-working space, a coffee shop, a church hall - which
// puts a screening on now and then among everything else it does. The sources
// covering such a venue report the whole programme, so the listing has to say
// for itself that a film is being shown.
//
// Deliberately a second transform rather than a change to
// `common/source-only/transform.js`: most source-only venues are film clubs and
// pop-ups whose listings are just the film's name, and filtering those the same
// way would drop data. Opting in per venue is what keeps that from happening,
// so reach for this only where the venue's own programme argues for it.
//
// Not for a cinema. A cinema's listings need no such test, and applying one
// there would drop films whose blurb happens not to use any of these words -
// see the note at the top of `common/is-film-event.js`.
const isFilmListing = ({ title, matchingHints }) =>
  isFilmEvent(`${title} ${matchingHints?.overview || ""}`);

async function transform(data, sourcedEvents) {
  const events = await sourceOnlyTransform(data, sourcedEvents);
  return events.filter(isFilmListing);
}

module.exports = transform;
