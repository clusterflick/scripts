const savoySystemsTransform = require("../../common/savoysystems.co.uk/transform");
const attributes = require("./attributes");

async function transform(movieData, sourcedEvents) {
  return savoySystemsTransform(attributes, "Rio.dll", movieData, sourcedEvents);
}

module.exports = transform;
