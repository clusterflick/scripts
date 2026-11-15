const { parse } = require("date-fns");

// How Billetto writes `starts_at` and `ends_at` - see retrieve.js for why
// these, rather than the epochs beside them, are the times read.
const LOCAL_TIME_FORMAT = "MMM dd yyyy HH:mm";

function parseLocalTime(hit, field) {
  if (hit.time_zone !== "Europe/London") {
    throw new Error(
      `Billetto event ${hit.objectID} is in ${hit.time_zone}, not Europe/London - ` +
        `its local time can't be read`,
    );
  }
  // Read in the process's zone, which the pipeline runs as Europe/London.
  const date = parse(hit[field], LOCAL_TIME_FORMAT, new Date());
  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `Billetto event ${hit.objectID} has an unreadable ${field}: "${hit[field]}"`,
    );
  }
  return date;
}

// The venue name whole, then each comma-separated part of it.
const getVenueNameParts = (venueName) => [
  ...new Set(
    [venueName, ...venueName.split(",")]
      .map((part) => part.trim())
      .filter(Boolean),
  ),
];

module.exports = { parseLocalTime, getVenueNameParts };
