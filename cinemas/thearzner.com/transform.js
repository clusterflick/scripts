const attributes = require("./attributes");
const savoySystemsTransform = require("../../common/savoysystems.co.uk/transform");

// Codes are from the "Event Key" The Arzner publishes on its What's On page.
// Deliberately unmapped: DUB (Dubbed) describes the print rather than access.
const tags = {
  hardOfHearing: ["CC"], // Closed Captions
  subtitled: ["SUB"], // Subtitled
};

async function transform(data, sourcedEvents) {
  return savoySystemsTransform(
    attributes,
    { urlSlug: "TheArzner.dll", tags },
    data,
    sourcedEvents,
  );
}

module.exports = transform;
