const { parse, isBefore, startOfDay, addYears, subDays } = require("date-fns");
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

  // If the date is more than 14 days in the past, it's likely a year-boundary
  // case (e.g. a December showing scraped in January) and we need to add a year.
  // Events within 14 days may just be recently passed events still listed on the page.
  const today = startOfDay(new Date());
  if (isBefore(parsedDate, subDays(today, 14))) return addYears(parsedDate, 1);

  return parsedDate;
};

module.exports = {
  parseDate,
};
