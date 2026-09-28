const sourceOnlyTransform = require("../../common/source-only/transform");
const { isFilmEvent } = require("../../common/is-film-event");

// Palestine House is a cultural centre and members' club whose programme runs
// well beyond film - talks, supper clubs, music, workshops - and its Ticket
// Tailor page sells all of it. The listing has to say for itself that a film
// is being shown, as at cinemas/staffordshirest.com/transform.js.
const isFilmListing = ({ title, matchingHints }) =>
  isFilmEvent(`${title} ${matchingHints?.overview || ""}`);

async function transform(data, sourcedEvents) {
  const events = await sourceOnlyTransform(data, sourcedEvents);
  return events.filter(isFilmListing);
}

module.exports = transform;
