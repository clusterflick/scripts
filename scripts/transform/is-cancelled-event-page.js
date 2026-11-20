const cheerio = require("cheerio");

// Statuses saying the date we hold won't go ahead. `EventRescheduled` and
// `EventMovedOnline` are left out: the first names a new date, the second
// still runs, and neither says the performance is gone.
const CANCELLED_STATUSES = ["EventCancelled", "EventPostponed"];

// schema.org values arrive as "https://schema.org/EventCancelled",
// "http://schema.org/...", "schema:EventCancelled" or bare "EventCancelled".
const statusName = (value) =>
  typeof value === "string" ? value.split(/[/:]/).pop() : undefined;

// `Event` and its subtypes - `ScreeningEvent`, `TheaterEvent`, `MusicEvent`.
const isEventNode = (node) =>
  [node?.["@type"]]
    .flat()
    .some((type) => typeof type === "string" && type.endsWith("Event"));

const topLevelNodes = (data) =>
  [data].flat().flatMap((node) => (node?.["@graph"] ? node["@graph"] : node));

/**
 * Does a listing page's structured data say the event has been cancelled?
 *
 * Recovery reads a page's visible text for phrases like "cancelled event", but
 * a venue words that however its page design likes. Eventbrite shows only a
 * "Cancelled" badge, so Bar Trash's cancelled Soylent Green at Beer Merchants
 * Tap was carried forward as still on. The JSON-LD on the same page says it
 * plainly - `"eventStatus": "https://schema.org/EventCancelled"` - and that is
 * a standard, not one platform's copy, so it is read here for every venue.
 *
 * Only top-level events count, and only when every one of them is cancelled
 * or postponed: a page carrying several dates, one of them called off, is
 * still advertising the others. A series' `subEvent`s are not read for the
 * same reason. An event with no `eventStatus` is scheduled, schema.org's
 * default, so it keeps the page live.
 *
 * A JSON-LD block that doesn't parse says nothing about the event either way,
 * so it is logged and skipped, and the other checks still decide.
 *
 * @param {string} html - The listing page as fetched
 * @param {string} url - The page's URL, for the log
 * @returns {boolean} True if the page's structured data cancels every event
 */
function isCancelledEventPage(html, url) {
  const $ = cheerio.load(html);
  const events = $('script[type="application/ld+json"]')
    .toArray()
    .flatMap((element) => {
      try {
        return topLevelNodes(JSON.parse($(element).text()));
      } catch {
        console.log(" - Unreadable JSON-LD, ignored:", url);
        return [];
      }
    })
    .filter(isEventNode);

  return (
    events.length > 0 &&
    events.every(({ eventStatus }) =>
      CANCELLED_STATUSES.includes(statusName(eventStatus)),
    )
  );
}

module.exports = isCancelledEventPage;
