const { parse, isBefore, startOfDay, addYears, subDays } = require("date-fns");
const { getText } = require("../utils");

// Screening links are the film slug suffixed with the screening id, e.g.
// "/uk/london/stratford/screenings/interstellar-2972". Dropping the id groups
// every screening of the same film together.
const getFilmSlug = (href) => href.split("/").pop().replace(/-\d+$/, "");

// The listing is paginated with no page count on it: the page past the end
// says so in words instead. Shared with the health probe, which walks the same
// pages and stops on the same sentence.
const NO_SCREENINGS_TEXT = "no upcoming screenings";

// Bounded because the probe walks this hourly: a listing that stops saying it
// has run out would otherwise page for ever. 25 pages is well past the 7
// Peckham needed when this was written.
const MAX_SCREENING_PAGES = 25;

// Walk the screenings list from its first page to its last, handing each page's
// HTML to `onPage`. `fetchPage` is the caller's own fetch, so the retrieve and
// the probe each bring their own error handling - the probe has to tell a
// challenge from an outage, and a plain fetch cannot.
const walkScreeningPages = async (fetchPage, onPage) => {
  for (let page = 1; page <= MAX_SCREENING_PAGES; page += 1) {
    const html = await fetchPage(page);
    if (html.toLowerCase().includes(NO_SCREENINGS_TEXT)) return;
    onPage(html.trim());
  }
  throw new Error(
    `Exceeded ${MAX_SCREENING_PAGES} screening pages - the stopping condition may have changed`,
  );
};

// Cards date their screenings "Sun, Aug 30", with no year and no label around
// it - it is simply the one span on the card shaped like a date, which is how
// both the transform and the probe find it.
const DATE_TEXT = /^\w+, \w+ \d+$/;

const findScreeningDateText = ($, $card) => {
  let dateText;
  $card.find("span").each((i, span) => {
    const text = getText($(span));
    if (DATE_TEXT.test(text)) {
      dateText = text;
      return false;
    }
  });
  return dateText;
};

// If the date is more than 14 days in the past, it's likely a year-boundary
// case (e.g. a December showing scraped in January) and we need to add a year.
// Events within 14 days may just be recently passed events still listed on the
// page.
const applyYearBoundary = (date) => {
  const today = startOfDay(new Date());
  if (isBefore(date, subDays(today, 14))) return addYears(date, 1);
  return date;
};

// The day a card is listed under, which is all a probe counting per date needs
// - a sold-out card carries its date but keeps its time behind the screening
// details endpoint, and asking for that is a request per sold-out screening.
function parseScreeningDay(dateText) {
  const parsedDate = parse(dateText, "EEE, MMM d", new Date());

  if (isNaN(parsedDate.getTime())) {
    throw new Error(`Unable to parse screening date: "${dateText}"`);
  }

  return applyYearBoundary(parsedDate);
}

function parseScreeningDate(dateText, timeText) {
  const dateOnly = parse(dateText, "EEE, MMM d", new Date());
  const parsedDate = parse(timeText, "h:mm a", dateOnly);

  if (isNaN(parsedDate.getTime())) {
    throw new Error(
      `Unable to parse screening date: "${dateText}" / "${timeText}"`,
    );
  }

  return applyYearBoundary(parsedDate);
}

module.exports = {
  getFilmSlug,
  walkScreeningPages,
  findScreeningDateText,
  parseScreeningDay,
  parseScreeningDate,
};
