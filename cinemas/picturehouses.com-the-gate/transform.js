const attributes = require("./attributes");
const picturehousesTransform = require("../../common/picturehouses.com/transform");

async function transform(data, sourcedEvents) {
  return picturehousesTransform(attributes, data, sourcedEvents);
}

module.exports = transform;
