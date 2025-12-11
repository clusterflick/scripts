const theCastleCinemaTransform = require("../../common/thecastlecinema.com/transform");
const attributes = require("./attributes");

async function transform(movieData, sourcedEvents) {
  return theCastleCinemaTransform(attributes, movieData, sourcedEvents);
}

module.exports = transform;
