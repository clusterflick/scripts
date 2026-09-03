// Every Savoy Systems venue is probed the same way on its own domain - see
// common/savoysystems.co.uk/health.js. Attributes arrive from the caller, so
// unlike `retrieve` there is nothing to bind here.
module.exports = require("../../common/savoysystems.co.uk/health");
