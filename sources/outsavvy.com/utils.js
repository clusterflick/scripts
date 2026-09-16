const cheerio = require("cheerio");
const { parse, isValid } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const { getText } = require("../../common/utils");
const attributes = require("./attributes");

// The location map an event page carries, which OutSavvy renders through its
// own Mapbox handler:
//   <img data-src="/Services/MapboxHandler.ashx?lng=-0.0723475&lat=51.5307&w=800&h=200&zoom=16" />
// It used to be a static marker image spelling the pair as
// "marker-point.png(<lon>,<lat>)", and find-events went on reading that long
// after the markup moved - a selector that matches nothing returns no
// coordinates rather than failing, so every event quietly fell back to matching
// its venue on name alone. Both readers share this one now so the next change
// of shape can only be missed once.
const MAP_IMAGE = ".website-map img[data-src*='MapboxHandler.ashx']";
const MAP_COORDINATES = /MapboxHandler\.ashx\?lng=([^&]+)&lat=([^&]+)&/;

// The venue block names the venue in a span of its own and then writes the
// address around it, ending in a "(view map)" link:
//   <span><span>Folklore</span><br />186 Hackney Road,&nbsp;London,&nbsp;E2 7QL
//   <a href="#event_map">(view map)</a></span>
// Taking the block's text without those two leaves the address on its own.
const VENUE_BLOCK = ".event-item-venue span";

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

// The event cards in a hashtag listing, addressed by where they point rather
// than by the grid they sit in. OutSavvy drops promotional panels into that
// grid - a banner linking to whichever hashtag it is pushing that month - and
// those carry an absolute href where an event card carries a path, so sweeping
// up every link in the container and prefixing the domain built a URL with two
// schemes in it. Taking only the event paths leaves the promo where it belongs
// and makes the prefixing safe by construction.
const EVENT_LINKS = "#eventscontent a[href^='/event/']";

/**
 * Read the event URLs out of a hashtag listing page.
 *
 * @param {string} html - HTML of a hashtag listing page
 * @returns {string[]} URLs of the events listed under that hashtag
 */
function parseListingEventUrls(html) {
  const $ = cheerio.load(html);
  return $(EVENT_LINKS)
    .map((i, elem) => `${attributes.domain}${$(elem).attr("href")}`)
    .get();
}

/**
 * Read the coordinates an event page publishes its venue at.
 *
 * @param {Object} $ - Cheerio instance for an event page
 * @returns {{lat: number, lon: number}|null} Venue coordinates, or null when
 *   the page carries no map to read them from
 */
function parseVenueCoordinates($) {
  const match = ($(MAP_IMAGE).attr("data-src") || "").match(MAP_COORDINATES);
  if (!match) return null;

  return { lon: parseFloat(match[1]), lat: parseFloat(match[2]) };
}

/**
 * Read the address an event page publishes its venue at. Used as the postcode
 * fallback for venues whose coordinates don't place them at the cinema.
 *
 * @param {Object} $ - Cheerio instance for an event page
 * @returns {string} Venue address, empty when the page carries no venue block
 */
function parseVenueAddress($) {
  const block = $(VENUE_BLOCK).first().clone();
  block.find("span").first().remove();
  block.find("a").remove();
  return getText(block);
}

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

  // A date offering its own times hides its DisplayDate behind them - the
  // widget builds a button per time and titles itself from the one picked - so
  // reading the date's own text here would take a value OutSavvy doesn't treat
  // as bookable. No event has published times this way yet, so rather than
  // guess at how they read, leave them to fail by the URL that has them.
  if (widgetDates.some(({ Times }) => (Times ?? []).length > 0)) return [];

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
  parseListingEventUrls,
  parseVenueCoordinates,
  parseVenueAddress,
  parseDate,
  parseBookingWidgetDates,
  parseEventDates,
};
