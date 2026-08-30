const { parse, isValid } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");

// The header an event publishes its date in, e.g.
// "Monday 3rd November 2025 at 7:30 PM"
const HEADER_DATE_FORMAT = "EEEE do MMMM yyyy 'at' h:mm a";

// The dates the booking widget is built from, e.g.
// "Saturday 19th September 2026  @ 8:00 PM" - an "@" where the header has an
// "at", and a double space in front of it, so the text is collapsed before it
// is read.
const WIDGET_DATE_FORMAT = "EEEE do MMMM yyyy '@' h:mm a";

// The widget's dates are assigned to a variable in an inline script, on one
// line and without a trailing semicolon.
const WIDGET_DATES = /var jsonDates\s*=\s*(\[.*\])\s*$/m;

function parseDate(date) {
  return parse(date, HEADER_DATE_FORMAT, new Date(), {
    locale: enGB,
  });
}

/**
 * Read the dates behind an event's booking widget.
 *
 * @param {string} scriptText - Text of the page's inline scripts
 * @returns {Date[]} Dates the event starts at, empty when they can't be read
 */
function parseBookingWidgetDates(scriptText) {
  const match = scriptText.match(WIDGET_DATES);
  if (!match) return [];

  let widgetDates;
  try {
    widgetDates = JSON.parse(match[1]);
  } catch {
    // Not a shape we know how to read. The header is the event's own statement
    // of when it is on and is read first, so this is only reached where that
    // has already failed - leave the event with no date and let the caller
    // decide what that means for the venue it is looking at.
    return [];
  }

  const dates = widgetDates.map(({ DisplayDate }) =>
    parse(
      String(DisplayDate).replace(/\s+/g, " ").trim(),
      WIDGET_DATE_FORMAT,
      new Date(),
      { locale: enGB },
    ),
  );

  // All or nothing: a widget we can only half read tells us the format has
  // moved on, and half of a multi-date event's dates is a worse answer than
  // none of them.
  return dates.every((date) => isValid(date)) ? dates : [];
}

/**
 * Read the dates an event starts at.
 *
 * The header is the event's own statement of when it is on, so it is used
 * wherever it can be read. It reads "at various times" when an event's tickets
 * don't all start together - a single screening sold with 8:00 PM and 8:30 PM
 * tickets, say - which leaves no time in the one place the page usually puts
 * one. The widget those tickets are booked through is built from its own list
 * of dates, which still carries the event's start, so it stands in there.
 *
 * @param {string} dateText - Text of the date header
 * @param {string} scriptText - Text of the page's inline scripts
 * @returns {Date[]} Dates the event starts at, empty when they can't be read
 */
function parseEventDates(dateText, scriptText) {
  const headerDate = parseDate(dateText);
  if (isValid(headerDate)) return [headerDate];

  return parseBookingWidgetDates(scriptText);
}

module.exports = {
  parseDate,
  parseBookingWidgetDates,
  parseEventDates,
};
