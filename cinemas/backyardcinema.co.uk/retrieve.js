const ticktekRetrieve = require("../../common/ticketek.co.uk/retrieve");
const attributes = require("./attributes");

async function retrieve() {
  return ticktekRetrieve(attributes);
}

module.exports = retrieve;
