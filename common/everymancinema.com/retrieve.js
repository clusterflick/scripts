const boxofficeapiRetrieve = require("../boxofficeapi/retrieve");

async function retrieve(attributes) {
  return boxofficeapiRetrieve(attributes, {
    listingPath: "venues-list",
    cachePrefix: "everyman",
  });
}

module.exports = retrieve;
