const attributes = require("./attributes");
const everymanTransform = require("../../common/everymancinema.com/transform");

async function transform(data, sourcedEvents) {
  return everymanTransform(attributes, data, sourcedEvents);
}

module.exports = transform;
