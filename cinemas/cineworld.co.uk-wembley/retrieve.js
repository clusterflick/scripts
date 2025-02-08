const attributes = require("./attributes");
const cineworldRetrieve = require("../../common/cineworld.co.uk/retrieve");

async function retrieve() {
  return cineworldRetrieve(attributes);
}

module.exports = retrieve;
