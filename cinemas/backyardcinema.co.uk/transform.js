const ticktekTransform = require("../../common/ticketek.co.uk/transform");
const attributes = require("./attributes");

async function transform(data, sourcedEvents) {
  return ticktekTransform(attributes, data, sourcedEvents);
}

module.exports = transform;
