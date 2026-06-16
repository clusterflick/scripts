const { parse } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");

function parseDate(date) {
  // ld+json startDate is ISO 8601 with a timezone offset, e.g.
  // "2026-06-16T15:15:00+01:00". Drop the offset and parse as local time
  // (tests and the pipeline run with TZ=Europe/London).
  const [localDateTime] = date.split(/[+Z]/);
  return parse(localDateTime, "yyyy-MM-dd'T'HH:mm:ss", new Date(), {
    locale: enGB,
  });
}

module.exports = {
  parseDate,
};
