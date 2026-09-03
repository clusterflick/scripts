const { parse, addYears, subDays } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");

// Dates and times come with no year, in two shapes. A film page's table gives
// them separately - "Wed 29 Jul" and "7 pm" (or "7.30 pm") - and the what's-on
// listing gives them as one string on the entry, "Tue 6 Oct, 7pm", with the
// space before the meridiem dropped. Normalised here so the transform and the
// health probe share one parser, and one year-boundary rule.
const parsePerformanceDate = (dateText, timeText) => {
  const now = new Date();
  const time = timeText.trim().replace(/(\d)\s*(am|pm)$/i, "$1 $2");
  const timeFormat = /\d\.\d/.test(time) ? "h.mm a" : "h a";
  let date = parse(
    `${dateText.trim()} ${time}`,
    `EEE d MMM ${timeFormat}`,
    now,
    {
      locale: enGB,
    },
  );
  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `Unable to parse performance date: ${dateText} ${timeText}`,
    );
  }
  if (date < subDays(now, 14)) {
    date = addYears(date, 1);
  }
  return date;
};

// A listing entry states one date and one time - "Tue 6 Oct, 7pm" - which is
// one showing. Anything else is a shape this doesn't read, and the caller is
// expected to say so rather than count it as one.
const parseListingDateTime = (text) => {
  const [dateText, timeText] = `${text}`.split(",");
  if (!dateText || !timeText) {
    throw new Error(`Unable to read a date and time from: "${text}"`);
  }
  return parsePerformanceDate(dateText, timeText);
};

module.exports = { parsePerformanceDate, parseListingDateTime };
