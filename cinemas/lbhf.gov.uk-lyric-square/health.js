// The BID calendar is probed the way the retrieve walks it - see
// common/tribe-events/health.js. The view is rebuilt per call because its
// initial url carries a cache-buster.
const createHealth = require("../../common/tribe-events/health");
const { getListingView } = require("./utils");

module.exports = (venues) => createHealth(getListingView())(venues);
