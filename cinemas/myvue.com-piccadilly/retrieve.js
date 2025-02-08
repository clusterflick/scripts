const attributes = require("./attributes");
const myvueRetrieve = require("../../common/myvue.com/retrieve");

async function retrieve() {
  return myvueRetrieve(attributes);
}

module.exports = retrieve;
