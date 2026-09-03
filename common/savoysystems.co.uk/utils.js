const { parse } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");

// The whole listing is a JSON blob assigned to a `var Events` in a script tag
// on the what's-on page, on one line - which is why this reads with `.` rather
// than needing the dot-all flag. Shared with the health probe, which reads the
// same blob and would otherwise be a second place for this to drift.
const EVENTS_SCRIPT = /<script>\s*var\s+Events\s+=\s+(.*)\s+<\/script>/i;

function extractEvents(html) {
  const events = html.match(EVENTS_SCRIPT);
  if (!events) {
    throw new Error(
      "No `var Events` listing data on the what's-on page - the page structure may have changed",
    );
  }
  return JSON.parse(events[1]);
}

function parseDate({ StartDate: date, StartTimeAndNotes: time }) {
  return parse(`${date}T${time}`, "yyyy-MM-dd'T'HH:mm", new Date(), {
    locale: enGB,
  });
}

module.exports = {
  extractEvents,
  parseDate,
};
