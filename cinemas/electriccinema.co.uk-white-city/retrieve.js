const attributes = require("./attributes");
const electriccinemaRetrieve = require("../../common/electriccinema.co.uk/retrieve");

async function retrieve() {
  return electriccinemaRetrieve(attributes);
}

module.exports = retrieve;
