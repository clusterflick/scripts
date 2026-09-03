// Every CineSync venue is probed the same way on its own API subdomain - see
// common/cinesync.io/health.js. Attributes arrive from the caller, so unlike
// `retrieve` there is nothing to bind here.
module.exports = require("../../common/cinesync.io/health");
