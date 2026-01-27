const attributes = require("./attributes");
const savoySystemsTransform = require("../../common/savoysystems.co.uk/transform");

async function transform(data, sourcedEvents) {
  return savoySystemsTransform(
    attributes,
    "PhoenixCinemaLondon.dll",
    data,
    sourcedEvents,
  );
}

module.exports = transform;
