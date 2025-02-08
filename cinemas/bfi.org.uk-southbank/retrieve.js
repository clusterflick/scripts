const bfiRetrieve = require("../../common/bfi.org.uk/retrieve");
const attributes = require("./attributes");

async function retrieve() {
  return bfiRetrieve(attributes);
}

module.exports = retrieve;
