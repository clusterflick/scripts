const attributes = require("./attributes");
const firmdaleHotelseRetrieve = require("../../common/firmdalehotels.com/retrieve");

async function retrieve() {
  return firmdaleHotelseRetrieve(attributes);
}

module.exports = retrieve;
