const boxofficeapiTransform = require("../boxofficeapi/transform");

const accessibilityTags = {
  "showtime.accessibility.subtitled": { subtitled: true },
  "showtime.accessibility.closedcaption": { hardOfHearing: true },
  "showtime.restriction.babyclub": { babyFriendly: true },
  "showtime.restriction.kidsfriendly": { babyFriendly: true },
};

async function transform(attributes, data, sourcedEvents) {
  return boxofficeapiTransform(
    attributes,
    data,
    { accessibilityTags },
    sourcedEvents,
  );
}

module.exports = transform;
