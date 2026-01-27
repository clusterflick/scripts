const savoySystemsRetrieve = require("../../common/savoysystems.co.uk/retrieve");
const attributes = require("./attributes");

async function retrieve() {
  return savoySystemsRetrieve(attributes);
}

module.exports = retrieve;
