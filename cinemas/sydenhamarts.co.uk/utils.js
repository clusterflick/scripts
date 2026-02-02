const { parse } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");

// Parse date format: "Thu January 29, 2026 7:30PM"
const parseEventDate = (dateString) => {
  const cleaned = dateString.trim();

  // Try parsing: "Thu January 29, 2026 7:30PM"
  let parsedDate = parse(cleaned, "EEE MMMM d, yyyy h:mma", new Date(), {
    locale: enGB,
  });

  if (!isNaN(parsedDate.getTime())) {
    return parsedDate;
  }

  // Try without day of week: "January 29, 2026 7:30PM"
  parsedDate = parse(cleaned, "MMMM d, yyyy h:mma", new Date(), {
    locale: enGB,
  });

  if (!isNaN(parsedDate.getTime())) {
    return parsedDate;
  }

  // Try with different time format: "Thu January 29, 2026 7:30 PM"
  parsedDate = parse(cleaned, "EEE MMMM d, yyyy h:mm a", new Date(), {
    locale: enGB,
  });

  if (!isNaN(parsedDate.getTime())) {
    return parsedDate;
  }

  throw new Error(`Unable to parse event date: ${dateString}`);
};

module.exports = {
  parseEventDate,
};
