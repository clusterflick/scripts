const { parse } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");

function parseDate(date) {
  // Date format: "Monday 3rd November 2025 at 7:30 PM"
  return parse(date, "EEEE do MMMM yyyy 'at' h:mm a", new Date(), {
    locale: enGB,
  });
}

module.exports = {
  parseDate,
};
