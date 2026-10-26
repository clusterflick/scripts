const { parse } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const { basicNormalize, sanitizeRichText } = require("../../common/utils");

function parseDate(date) {
  return parse(date, "yyyy-MM-dd'T'HH:mm", new Date(), {
    locale: enGB,
  });
}

// Parts of a venue name that place the event inside a building rather than
// name the venue - "Room 201", "Richard Hoggart Building (RHB) 142", "Brunei
// Gallery Lecture Theatre (BGLT)", "E002", "SE 1.05". A room code is a single
// letter and three or more digits, or a dotted number, which keeps venues
// named like codes - 229, JW3, LEX2 - out of it.
const ROOM_PARTS = [
  /^room\b/i,
  /\bbuilding\b/i,
  /\blecture theatre\b/i,
  /\bfloor\b/i,
  /^level\b/i,
  /\bwing\b/i,
  /^basement$/i,
  /^(?:[A-Z]\d{3,}|[A-Z]{0,2}\s?\d+\.\d+)$/i,
];

/**
 * The part of an Eventbrite venue name that names the venue.
 *
 * Split on commas and pipes ("BFI Southbank, London" -> "BFI Southbank", "The
 * Beehive Pub | Tottenham" -> "The Beehive Pub"), deliberately not on a dash:
 * it's as likely to precede the part that identifies the venue as to follow
 * it, and "Vue Cinema London - Westfield Stratford" truncated to "Vue Cinema
 * London" matches nothing.
 *
 * The first part is usually the venue, unless it is a room inside one - "Room
 * 201, Main Building, SOAS University of London" - so leading room parts are
 * skipped. Only those: a later part is as likely to be the area as the venue,
 * and "St John's Church, Hyde Park" is a church, not the park. The last part
 * is never skipped, so there is always a name to match - and a trailing comma
 * doesn't leave an empty one to fall back on: "Lecture Theatre B304,
 * Basement, Cruciform Building," is the Cruciform Building.
 * @param {string} name - The venue name as Eventbrite gives it
 * @returns {string} The name to match against the venues we hold
 */
function getVenueName(name) {
  const parts = (name || "").split(/[,|]/).filter((part) => part.trim());
  const venuePart = parts.findIndex(
    (part, index) =>
      index === parts.length - 1 ||
      !ROOM_PARTS.some((pattern) => pattern.test(part.trim())),
  );
  return parts[venuePart] ?? "";
}

/**
 * The venue fields an event is matched on, or null if it carries no venue.
 *
 * Shared so that retrieve and find-events cannot drift apart: retrieve decides
 * which events are worth an event-page request by asking whether they sit at a
 * venue we hold, and find-events then reads those pages back. If the two ever
 * disagreed about what counts as a match, retrieve would skip a page that
 * find-events goes looking for.
 */
function getEventVenue(event) {
  const venue = event.primary_venue;
  if (!venue || !venue.address) return null;

  const {
    name,
    address: {
      longitude: lon,
      latitude: lat,
      localized_address_display: eventAddress,
    },
  } = venue;

  // localized_address_display is like "265 Lavender Hill, London, SW11 1JB"
  return {
    venueName: getVenueName(name),
    coordinates: { lat, lon },
    eventAddress,
  };
}

function getEventDescription(details) {
  if (!details) return "";

  const context =
    details.components?.eventDescription || details.props?.pageProps?.context;

  // Bail if we can't traverse down to get the right context data
  if (!context || context === details) return "";

  return (
    context.structuredContent?.modules
      .filter(({ type }) => basicNormalize(type) === "text")
      .map(({ text }) => sanitizeRichText(text))
      .join("\n\n")
      .replace(/\n\n+/gi, "\n\n") || ""
  );
}

/**
 * The ticket availability Eventbrite reports for a listing, as a performance
 * `status`.
 *
 * `salesStatus` describes the listing as a whole. `sold_out` is the live case;
 * once selling stops the status becomes `sales_ended` and the reason moves to
 * `messageCode`, so an event that sold out and then closed reads
 * `sales_ended`/`tickets_sold_out` and is still a sell-out. Sales ending for
 * any other reason is not, hence keying on the message code rather than the
 * status.
 *
 * An event whose page we could not reach carries no status at all, and gets
 * none here: unknown availability and confirmed availability are different
 * claims, and only the second is safe to publish as `soldOut: false`.
 */
function getEventStatus(details) {
  const salesStatus = details?.props?.pageProps?.context?.salesStatus;
  if (!salesStatus) return {};

  return { soldOut: salesStatus.messageCode === "tickets_sold_out" };
}

// "Festival" and "Fest" as a word ("DzFest - The Algerian Festival"), but not
// "Festive", which is a Christmas season rather than an event of its own.
const FESTIVAL_NAME_PATTERN = /festival|fest\b/i;

/**
 * Notes naming the festivals an event is listed under, from the collections on
 * its page.
 *
 * Organisers group their events into collections, and a festival's organiser
 * usually makes one named after the festival - often the only place the
 * festival is named outside the description. Most collections are not
 * festivals ("Leyton Library Events", "Business Networking London"), so only
 * those named as one become notes. The name is the collection's own, so a new
 * festival or a new edition needs nothing adding here.
 *
 * A festival the title already names is left out, as billing already in the
 * title is not repeated in the notes.
 */
function getFestivalCollectionNotes(details, title = "") {
  const collections = details?.props?.pageProps?.context?.collections || [];
  const normalizedTitle = basicNormalize(title);

  const names = collections
    .map(({ name }) => (name || "").replace(/\s+/g, " ").trim())
    .filter((name) => FESTIVAL_NAME_PATTERN.test(name))
    .filter((name) => !normalizedTitle.includes(basicNormalize(name)));

  return [...new Set(names)].map((name) => `Part of ${name}`);
}

module.exports = {
  parseDate,
  getVenueName,
  getEventVenue,
  getEventDescription,
  getEventStatus,
  getFestivalCollectionNotes,
};
