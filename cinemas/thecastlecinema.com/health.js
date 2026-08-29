// Both Castle venues are probed the same way on their own domain - see
// common/thecastlecinema.com/health.js. Attributes arrive from the caller, so
// unlike `retrieve` there is nothing to bind here.
module.exports = require("../../common/thecastlecinema.com/health");
