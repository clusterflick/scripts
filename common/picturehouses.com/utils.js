const { parse } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");

function parseDate(date) {
  return parse(date, "yyyy-MM-dd'T'HH:mm:ss", new Date(), {
    locale: enGB,
  });
}

module.exports = {
  parseDate,
};
