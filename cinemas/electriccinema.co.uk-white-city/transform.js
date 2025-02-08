const attributes = require("./attributes");
const electriccinemaTransform = require("../../common/electriccinema.co.uk/transform");

async function transform(data, sourcedEvents) {
  return electriccinemaTransform(attributes, data, sourcedEvents);
}

module.exports = transform;
