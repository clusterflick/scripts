const { parse, isBefore, startOfDay, addYears, subDays } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");

// The Bush Theatre lists dates and times without a year, e.g.
// date "Mon 13 July" and time "7:00pm".
const parseDate = (dateString, timeString) => {
  const parsedDate = parse(
    `${dateString} ${timeString}`,
    "EEE d MMMM h:mma",
    new Date(),
    { locale: enGB },
  );

  // It's unexpected to not find a parsable date, so throw
  if (isNaN(parsedDate.getTime())) throw new Error("Unable to parse date");

  // With no year in the source, date-fns defaults to the current year. If the
  // date is more than 14 days in the past, it's a year-boundary case (e.g. a
  // January showing scraped in July) and we need to add a year. Events within
  // 14 days may just be recently passed events still listed on the page.
  const today = startOfDay(new Date());
  if (isBefore(parsedDate, subDays(today, 14))) return addYears(parsedDate, 1);

  return parsedDate;
};

// Parse a running time such as "1 hour 25 minutes", "2 hours" or "1 hour" into
// a total number of minutes. Returns undefined when no running time is given.
const parseRunningTimeToMins = (runningTime) => {
  if (!runningTime) return undefined;
  const hours = runningTime.match(/(\d+)\s*hour/i);
  const minutes = runningTime.match(/(\d+)\s*min/i);
  if (!hours && !minutes) return undefined;
  return (
    (hours ? parseInt(hours[1], 10) * 60 : 0) +
    (minutes ? parseInt(minutes[1], 10) : 0)
  );
};

module.exports = {
  parseDate,
  parseRunningTimeToMins,
};
