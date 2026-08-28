const { format } = require("date-fns");

// The showtimes page renders one date at a time and names the rest in an inline
// `allowedDatesTimestamps` array - the dates this venue actually has listings
// for, not a fixed calendar window: 54 at Sutton and 43 at Wigan the day this
// was written. Both the retrieve and the health probe start from it, so it lives
// here rather than in either.
//
// An empty array is read as an empty array rather than as a missing one: a venue
// with nothing on and a page that has stopped carrying the array are different
// answers, and the health probe records the first and fails on the second.
function extractAllowedDates(html) {
  const match = html.match(/allowedDatesTimestamps\s*=\s*(\[[^\]]*\])/);
  if (!match)
    throw new Error("Could not find allowedDatesTimestamps on showtimes page");
  const timestamps = JSON.parse(match[1]);
  // Timestamps are midnight BST; format() uses TZ=Europe/London (set by pipeline)
  const toDateStr = (ts) => format(new Date(ts), "yyyy-MM-dd");
  return [...new Set(timestamps.map(toDateStr))].sort();
}

module.exports = { extractAllowedDates };
