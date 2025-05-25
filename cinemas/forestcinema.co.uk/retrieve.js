const attributes = require("./attributes");
const admitOneRetrieve = require("../../common/admit-one.co.uk/retrieve");

async function retrieve() {
  return admitOneRetrieve(attributes);
}

module.exports = retrieve;
