const { parse } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");

function parseDate({ StartDate: date, StartTimeAndNotes: time }) {
  return parse(`${date}T${time}`, "yyyy-MM-dd'T'HH:mm", new Date(), {
    locale: enGB,
  });
}

module.exports = {
  parseDate,
};
