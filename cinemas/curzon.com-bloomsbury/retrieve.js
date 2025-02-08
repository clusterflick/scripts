const attributes = require("./attributes");
const curzonRetrieve = require("../../common/curzon.com/retrieve");

async function retrieve() {
  return curzonRetrieve(attributes);
}

module.exports = retrieve;
