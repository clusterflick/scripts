const boxofficeapiTransform = require("../boxofficeapi/transform");

const accessibilityTags = {
  "showtime.accessibility.subtitled": { subtitled: true },
  "showtime.accessibility.audiodescription": { audioDescription: true },
  "showtime.accessibility.autismfriendly": { relaxed: true },
  "showtime.restriction.babyclub": { babyFriendly: true },
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
