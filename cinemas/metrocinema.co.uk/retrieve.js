const attributes = require("./attributes");
const cinesyncRetrieve = require("../../common/cinesync.io/retrieve");

async function retrieve() {
  return cinesyncRetrieve(attributes);
}

module.exports = retrieve;
