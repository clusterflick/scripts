const ocapiv1Transform = require("../ocapi-v1/transform");

async function transform(attributes, showtimeDays, sourcedEvents) {
  const getBookingUrl = ({ id }) =>
    `${attributes.domain}/ticketing/seats/${id}/`;

  return ocapiv1Transform(
    attributes,
    showtimeDays,
    { getBookingUrl },
    sourcedEvents,
  );
}

module.exports = transform;
