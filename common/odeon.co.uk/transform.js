const ocapiv1Transform = require("../ocapi-v1/transform");

// "Wheelchair Accessible" and "Flash Warning" come with a sentence of chain
// boilerplate restating the label, repeated on most showings; the label alone
// says the same thing.
const noteLabels = {
  strip: ["Wheelchair Accessible", "Flash Warning"],
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
