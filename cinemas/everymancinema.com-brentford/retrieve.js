const attributes = require("./attributes");
const everymanRetrieve = require("../../common/everymancinema.com/retrieve");

async function retrieve() {
  return everymanRetrieve(attributes);
}

module.exports = retrieve;
