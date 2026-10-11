const attributes = require("./attributes");
const indycinemagroupTransform = require("../../common/indycinemagroup.com/transform");

async function transform(data, sourcedEvents) {
  return indycinemagroupTransform(attributes, data, sourcedEvents);
}

module.exports = transform;
