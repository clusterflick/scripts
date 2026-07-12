const ocapiv1Transform = require("../ocapi-v1/transform");

// Labels whose description just restates the label - keep the label alone.
const noteLabels = {
  strip: [
    "Satellite Event",
    "Film Club",
    "Atmos",
    "Screening followed by a Q&A",
    "Special Preview",
    "Encore",
  ],
};

async function transform(attributes, showtimeDays, sourcedEvents) {
  const getBookingUrl = ({ id }) =>
    `${attributes.domain}/ticketing/seats/${id}/`;

  return ocapiv1Transform(
    attributes,
    showtimeDays,
    { getBookingUrl, noteLabels },
    sourcedEvents,
  );
}

module.exports = transform;
