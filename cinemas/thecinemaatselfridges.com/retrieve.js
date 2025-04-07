const olympicStudiosRetrieve = require("../../common/olympicstudios.com/retrieve");
const attributes = require("./attributes");

async function retrieve() {
  return olympicStudiosRetrieve(attributes);
}

module.exports = retrieve;
