// Every IndyCinemaGroup venue is probed the same way behind its own `site_id` -
// see common/indycinemagroup.com/health.js. Attributes arrive from the caller,
// so unlike `retrieve` there is nothing to bind here.
module.exports = require("../../common/indycinemagroup.com/health");
