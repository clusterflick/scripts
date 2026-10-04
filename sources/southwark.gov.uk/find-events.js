const { findEvents } = require("../../common/localgov-drupal/find-events");
const attributes = require("./attributes");

module.exports = (cinema) => findEvents(cinema, attributes);
