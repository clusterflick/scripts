const { parse } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");

// Both "6:30pm" and "8pm" are published; the minutes are dropped when they're
// on the hour.
const TIME_PATTERN = "(\\d{1,2}(?::\\d{2})?\\s*[ap]m)";
const START_TIME = new RegExp(`start time:\\s*${TIME_PATTERN}`, "i");
const DOOR_TIME = new RegExp(`door time:\\s*${TIME_PATTERN}`, "i");

/**
 * Pull the time a screening begins out of the "Time" row of an event page,
 * which reads "Door time: 6:30pm, start time: 7:00pm".
 *
 * The door time stands in where no start time is published, as the closest
 * thing to a screening time on offer. Some events publish neither ("Door time
 * varies - see details below"), and those have no time to place them at.
 *
 * @param {string} timeText - Text of the "Time" row
 * @returns {string|null} Time as "h:mmam/pm", or null when none is published
 */
function extractTime(timeText) {
  const match = timeText.match(START_TIME) || timeText.match(DOOR_TIME);
  if (!match) return null;

  const time = match[1].replace(/\s+/g, "").toLowerCase();
  return time.includes(":") ? time : time.replace(/([ap]m)$/, ":00$1");
}

/**
 * Build the date a screening starts at from the "Date" and "Time" rows of an
 * event page.
 *
 * @param {string} dateText - Text of the "Date" row, e.g. "Thursday 20th August, 2026"
 * @param {string} timeText - Text of the "Time" row
 * @returns {Date|null} Start of the screening, or null when no time is published
 */
function parseEventDate(dateText, timeText) {
  const time = extractTime(timeText);
  if (!time) return null;

  // An event running over more than one day reads "Saturday 5th December, 2026
  // to Sunday 6th December, 2026", and can carry its hours on a second line.
  const startDate = dateText
    .split("\n")[0]
    .split(/\s+to\s+/)[0]
    .trim();

  const date = parse(
    `${startDate} ${time}`,
    "EEEE do MMMM, yyyy h:mma",
    new Date(),
    { locale: enGB },
  );
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Failed to parse date "${startDate}" and time "${time}"`);
  }

  return date;
}

module.exports = {
  extractTime,
  parseEventDate,
};
