const theCastleCinemaRetrieve = require("../../common/thecastlecinema.com/retrieve");
const attributes = require("./attributes");

async function retrieve() {
  return theCastleCinemaRetrieve(attributes);
}

module.exports = retrieve;
