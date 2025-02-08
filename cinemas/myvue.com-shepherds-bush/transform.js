const attributes = require("./attributes");
const myvueTransform = require("../../common/myvue.com/transform");

async function transform(data, sourcedEvents) {
  return myvueTransform(attributes, data, sourcedEvents);
}

module.exports = transform;
