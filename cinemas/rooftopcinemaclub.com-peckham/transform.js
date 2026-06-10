const attributes = require("./attributes");
const rooftopTransform = require("../../common/rooftopcinemaclub.com/transform");

async function transform(data, sourcedEvents) {
  return rooftopTransform(attributes, data, sourcedEvents);
}

module.exports = transform;
