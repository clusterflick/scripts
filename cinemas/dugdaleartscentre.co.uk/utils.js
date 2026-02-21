const { parse } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");

// Parse Spektrix date format: "05 Feb 2026 - 19:30 (Thu)"
const parseSpektrixDate = (dateString) => {
  // Remove the day of week suffix e.g. "(Thu)" and "(Sat) - Online booking closed"
  const cleanedDate = dateString.replace(/\s*\([^)]+\)( - .+)?$/, "").trim();

  const parsedDate = parse(cleanedDate, "dd MMM yyyy - HH:mm", new Date(), {
    locale: enGB,
  });

  if (isNaN(parsedDate.getTime())) {
    throw new Error(`Unable to parse Spektrix date: ${dateString}`);
  }

  return parsedDate;
};

module.exports = {
  parseSpektrixDate,
};
