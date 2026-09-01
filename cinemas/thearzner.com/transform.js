const attributes = require("./attributes");
const savoySystemsTransform = require("../../common/savoysystems.co.uk/transform");

const tags = {
  hardOfHearing: ["CC"], // Closed Captions
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
