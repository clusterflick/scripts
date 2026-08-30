const { parse, isBefore, startOfDay, addYears, subDays } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");

// The film pages date their screenings "Sun 30 Aug" and the what's-on page
// dates the same screenings "Sunday 30 August", so the caller says which it is
// holding. The year-boundary rule below applies to both and stays in one place.
const FILM_PAGE_DATE = "EEE dd MMM 'T' HH:mm";
const LISTING_PAGE_DATE = "EEEE d MMMM 'T' HH:mm";

const parseDate = (dateString, format = FILM_PAGE_DATE) => {
  const parsedDate = parse(dateString, format, new Date(), {
    locale: enGB,
  });

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
  FILM_PAGE_DATE,
  LISTING_PAGE_DATE,
};
