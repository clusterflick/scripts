const attributes = require("./attributes");
const rooftopRetrieve = require("../../common/rooftopcinemaclub.com/retrieve");

async function retrieve() {
  return rooftopRetrieve(attributes);
}

module.exports = retrieve;
