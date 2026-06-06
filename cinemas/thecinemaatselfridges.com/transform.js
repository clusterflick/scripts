const attributes = require("./attributes");
const olympicStudiosTransform = require("../../common/olympicstudios.com/transform");
const { isNotSportShowing } = require("../../common/is-sport-showing");

async function transform(data, sourcedEvents) {
  const movies = await olympicStudiosTransform(attributes, data, sourcedEvents);
  return movies.filter(isNotSportShowing);
}

module.exports = transform;
