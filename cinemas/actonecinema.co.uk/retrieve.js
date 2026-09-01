const attributes = require("./attributes");
const savoySystemsRetrieve = require("../../common/savoysystems.co.uk/retrieve");

async function retrieve() {
  return savoySystemsRetrieve(attributes);
}

module.exports = retrieve;
