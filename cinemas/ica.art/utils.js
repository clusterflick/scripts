const { parse, isBefore, startOfDay, addYears, subDays } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");

const parseDate = (dateString) => {
  // Mon, 13 Oct 2025 08:30 pm
  const parsedDate = parse(
    dateString,
    "EEE, dd MMM yyyy hh:mm aaa",
    new Date(),
    {
      locale: enGB,
    },
  );

  // It's unexpected to not find a parsable date, so throw
  if (isNaN(parsedDate.getTime())) throw new Error("Unable to parse date");

  return parsedDate;
};

// The what's-on page dates a screening "Monday, 31 August" under a heading the
// screenings sit beneath, where a film page dates the same screening "Mon, 13
// Oct 2025 08:30 pm" against the screening itself. Only the listing form needs
// a year inferred, which is why this is a second function rather than a format
// argument to the one above.
const parseListingDate = (dateText) => {
  const parsedDate = parse(dateText, "EEEE, d MMMM", new Date(), {
    locale: enGB,
  });

  if (isNaN(parsedDate.getTime())) {
    throw new Error(`Unable to parse listing date: "${dateText}"`);
  }

  // A date more than 14 days past is next year's - a December heading read in
  // January. Inside that window it is a day that has just gone and is still on
  // the page.
  const today = startOfDay(new Date());
  if (isBefore(parsedDate, subDays(today, 14))) return addYears(parsedDate, 1);

  return parsedDate;
};

module.exports = {
  parseDate,
  parseListingDate,
};
