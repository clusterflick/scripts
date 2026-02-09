const { parse, isBefore, startOfDay, addYears } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");

const parseDate = (dateString) => {
  // Correct if the time is separated by "." instead of ":"
  dateString = dateString.replace(/(\d+)\.(\d+)/, "$1:$2");

  let parsedDate = parse(dateString, "EEEE do LLLL h:mmaaa", new Date(), {
    locale: enGB,
  });

  // Sometimes times won't have minutes if it's on the hour
  if (isNaN(parsedDate.getTime())) {
    parsedDate = parse(dateString, "EEEE do LLLL haaa", new Date(), {
      locale: enGB,
    });
  }

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
