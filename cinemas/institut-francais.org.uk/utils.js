const { parse } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");

const parseDate = (dateString) => {
  const parsedDate = parse(dateString, "yyyy-MM-dd HH:mm", new Date(), {
    locale: enGB,
  });

  // It's unexpected to not find a parsable date, so throw
  if (isNaN(parsedDate.getTime())) throw new Error("Unable to parse date");

  return parsedDate;
};

module.exports = {
  parseDate,
};
