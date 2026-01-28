const tateRetrieve = require("../../common/tate.org.uk/retrieve");
const attributes = require("./attributes");

async function retrieve() {
  return tateRetrieve(attributes);
}

module.exports = retrieve;
