const attributes = require("./attributes");
const cineworldTransform = require("../../common/cineworld.co.uk/transform");

async function transform(data, sourcedEvents) {
  return cineworldTransform(attributes, data, sourcedEvents);
}

module.exports = transform;
