const { parse } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");

// Parse date formats like:
// "Thu 12 Feb 2026, 6pm-9pm"
// "Thurs 19 Feb, 6.30pm | Free, No Booking Required"
const parseEventDate = (dateString) => {
  // Clean up the date string
  let cleaned = dateString
    .replace(/\|.*$/, "") // Remove everything after |
    .replace(/-\d+(?::\d+)?(?:am|pm)/i, "") // Remove end time (e.g., "-9pm")
    .replace(/\s+/g, " ")
    .trim();

  // Normalize day abbreviations
  cleaned = cleaned
    .replace(/^Thurs\b/i, "Thu")
    .replace(/^Tues\b/i, "Tue")
    .replace(/^Weds\b/i, "Wed");

  // Try parsing with year first: "Thu 12 Feb 2026, 6pm"
  let parsedDate = parse(cleaned, "EEE d MMM yyyy, h.mma", new Date(), {
    locale: enGB,
  });

  if (!isNaN(parsedDate.getTime())) {
    return parsedDate;
  }

  // Try without the dot in time: "Thu 12 Feb 2026, 6pm"
  parsedDate = parse(cleaned, "EEE d MMM yyyy, ha", new Date(), {
    locale: enGB,
  });

  if (!isNaN(parsedDate.getTime())) {
    return parsedDate;
  }

  // Try with minutes: "Thu 12 Feb 2026, 6:30pm"
  parsedDate = parse(cleaned, "EEE d MMM yyyy, h:mma", new Date(), {
    locale: enGB,
  });

  if (!isNaN(parsedDate.getTime())) {
    return parsedDate;
  }

  // Try without year (use current year): "Thu 19 Feb, 6.30pm"
  const currentYear = new Date().getFullYear();
  const withYear = cleaned.replace(/,/, ` ${currentYear},`);

  parsedDate = parse(withYear, "EEE d MMM yyyy, h.mma", new Date(), {
    locale: enGB,
  });

  if (!isNaN(parsedDate.getTime())) {
    return parsedDate;
  }

  // Try without dot in time and without year: "Thu 19 Feb, 6pm"
  parsedDate = parse(withYear, "EEE d MMM yyyy, ha", new Date(), {
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
