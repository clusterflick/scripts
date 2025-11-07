const attributes = require("./attributes");
const indycinemagroupRetrieve = require("../../common/indycinemagroup.com/retrieve");

async function retrieve() {
  return indycinemagroupRetrieve(attributes);
}

module.exports = retrieve;
