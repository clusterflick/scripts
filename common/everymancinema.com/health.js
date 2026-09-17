const boxofficeapiHealth = require("../boxofficeapi/health");

const DOMAIN = "https://www.everymancinema.com";

// A seasonal pop-up with a hard-coded schedule that the retrieve pulls from a
// hosted CSV, so it has no theater id and this API knows nothing about it. The
// same exclusion data-analysed's check-everyman-ids.js carries.
const NOT_ON_THIS_API = [
  "everymancinema.com-everyman-on-the-canal-at-kings-cross",
];

async function health(venues) {
  return boxofficeapiHealth(
    venues.filter(({ id }) => !NOT_ON_THIS_API.includes(id)),
    DOMAIN,
  );
}

module.exports = health;
