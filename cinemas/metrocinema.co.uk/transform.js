const attributes = require("./attributes");
const cinesyncTransform = require("../../common/cinesync.io/transform");

async function transform(data, sourcedEvents) {
  return cinesyncTransform(attributes, data, sourcedEvents);
}

module.exports = transform;
