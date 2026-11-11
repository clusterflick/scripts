const attributes = require("./attributes");
const savoySystemsTransform = require("../../common/savoysystems.co.uk/transform");

// Codes are from the "Event Key" Phoenix publishes on its What's On page.
// Deliberately unmapped: NA (Phoenix for Nature) names a programme strand.
const tags = {
  audioDescription: ["AD"], // Audio Described
  hardOfHearing: ["CC"], // Closed Captions
  subtitled: ["SU"], // Subtitled
  babyFriendly: ["BB"], // Watch With Baby
  relaxed: ["R"], // Relaxed Screening
  notes: {
    QA: "This screening will be followed by a Q&A",
  },
};

async function transform(data, sourcedEvents) {
  return savoySystemsTransform(
    attributes,
    { urlSlug: "PhoenixCinemaLondon.dll", tags },
    data,
    sourcedEvents,
  );
}

module.exports = transform;
