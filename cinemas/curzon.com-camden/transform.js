const attributes = require("./attributes");
const curzonTransform = require("../../common/curzon.com/transform");

async function transform(data, sourcedEvents) {
  return curzonTransform(attributes, data, sourcedEvents);
}

module.exports = transform;
