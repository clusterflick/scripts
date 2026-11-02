const attributes = require("./attributes");
const prettyDecentTransform = require("../../common/prettydecentbeer.co/transform");

async function transform(data, sourcedEvents) {
  return prettyDecentTransform(attributes, data, sourcedEvents);
}

module.exports = transform;
