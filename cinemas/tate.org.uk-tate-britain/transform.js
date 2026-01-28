const attributes = require("./attributes");
const tateTransform = require("../../common/tate.org.uk/transform");

async function transform(data, sourcedEvents) {
  return tateTransform(attributes, data, sourcedEvents);
}

module.exports = transform;
