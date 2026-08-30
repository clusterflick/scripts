// The venue's list view is probed the way the retrieve walks it - see
// common/tribe-events/health.js.
const createHealth = require("../../common/tribe-events/health");
const { listingView } = require("./utils");

module.exports = createHealth(listingView);
