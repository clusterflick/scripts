// Every Olympic Studios venue is probed the same way on its own domain - see
// common/olympicstudios.com/health.js. Attributes arrive from the caller, so
// unlike `retrieve` there is nothing to bind here.
module.exports = require("../../common/olympicstudios.com/health");
