const boxofficeapiRetrieve = require("../boxofficeapi/retrieve");

async function retrieve(attributes) {
  return boxofficeapiRetrieve(attributes, {
    listingPath: "cinemas",
    cachePrefix: "cineworld",
  });
}

module.exports = retrieve;
