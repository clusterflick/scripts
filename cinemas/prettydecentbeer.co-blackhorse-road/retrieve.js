const attributes = require("./attributes");
const prettyDecentRetrieve = require("../../common/prettydecentbeer.co/retrieve");

async function retrieve() {
  return prettyDecentRetrieve(attributes);
}

module.exports = retrieve;
