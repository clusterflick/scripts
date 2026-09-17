const boxofficeapiHealth = require("../boxofficeapi/health");

const DOMAIN = "https://www.cineworld.co.uk";

async function health(venues) {
  return boxofficeapiHealth(venues, DOMAIN);
}

module.exports = health;
