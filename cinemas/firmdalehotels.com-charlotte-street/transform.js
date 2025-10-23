const attributes = require("./attributes");
const firmdaleHotelsTransform = require("../../common/firmdalehotels.com/transform");

async function transform(data, sourcedEvents) {
  return firmdaleHotelsTransform(attributes, data, sourcedEvents);
}

module.exports = transform;
