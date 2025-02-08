const attributes = require("./attributes");
const bfiTransform = require("../../common/bfi.org.uk/transform");

async function transform(data, sourcedEvents) {
  return bfiTransform(attributes, data, sourcedEvents);
}

module.exports = transform;
