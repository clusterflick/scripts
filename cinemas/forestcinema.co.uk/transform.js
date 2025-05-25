const attributes = require("./attributes");
const admitOneTransform = require("../../common/admit-one.co.uk/transform");

async function transform(data, sourcedEvents) {
  return admitOneTransform(attributes, data, sourcedEvents);
}

module.exports = transform;
