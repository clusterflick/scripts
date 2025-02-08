const { parse, isBefore, startOfDay, addYears } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");

const parseDate = (dateString) => {
  const parsedDate = parse(dateString, "EEE dd MMM 'T' HH:mm", new Date(), {
    locale: enGB,
  });

  // It's unexpected to not find a parsable date, so throw
  if (isNaN(parsedDate.getTime())) throw new Error("Unable to parse date");

  // If the date is in the past, then it's probably on the year boundary
  // and we need to add a year
  const today = startOfDay(new Date());
  if (isBefore(parsedDate, today)) return addYears(parsedDate, 1);

  return parsedDate;
};

module.exports = {
  parseDate,
};
