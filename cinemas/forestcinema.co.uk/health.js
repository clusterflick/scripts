// Every Admit One venue is probed the same way on its own domain - see
// common/admit-one.co.uk/health.js. Attributes arrive from the caller, so
// unlike `retrieve` there is nothing to bind here.
module.exports = require("../../common/admit-one.co.uk/health");
