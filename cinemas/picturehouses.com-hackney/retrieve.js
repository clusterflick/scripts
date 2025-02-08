const attributes = require("./attributes");
const picturehousesRetrieve = require("../../common/picturehouses.com/retrieve");

async function retrieve() {
  return picturehousesRetrieve(attributes);
}

module.exports = retrieve;
