const attributes = require("./attributes");
const olympicStudiosTransform = require("../../common/olympicstudios.com/transform");

async function transform(data, sourcedEvents) {
  return olympicStudiosTransform(attributes, data, sourcedEvents);
}

module.exports = transform;
