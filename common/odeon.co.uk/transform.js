const ocapiv1Transform = require("../ocapi-v1/transform");

// "Watchword" is a promoted brand tag Odeon stamps on showings; it carries no
// description, so it would otherwise land in the notes as a bare, meaningless
// word. It is not a dependable accessibility marker either — it usually rides
// along with "Audio Described", but plenty of showings carry it with no
// accessibility attribute at all, so it is dropped rather than mapped.
//
// "Wheelchair Accessible" and "Flash Warning" come with a sentence of chain
// boilerplate restating the label, repeated on most showings; the label alone
// says the same thing.
const noteLabels = {
  strip: ["Wheelchair Accessible", "Flash Warning"],
  drop: ["Watchword"],
};

async function transform(attributes, showtimeDays, sourcedEvents) {
  const getBookingUrl = ({ id }) =>
    `${attributes.domain}/ticketing/seat-picker/?showtimeId=${id}`;
  return ocapiv1Transform(
    attributes,
    showtimeDays,
    { getBookingUrl, noteLabels },
    sourcedEvents,
  );
}

module.exports = transform;
