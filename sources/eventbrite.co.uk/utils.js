const { parse } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const { basicNormalize, sanitizeRichText } = require("../../common/utils");

function parseDate(date) {
  return parse(date, "yyyy-MM-dd'T'HH:mm", new Date(), {
    locale: enGB,
  });
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

  // Split venue name before matching (e.g., "BFI Southbank, London" -> "BFI
  // Southbank", "The Beehive Pub | Tottenham" -> "The Beehive Pub").
  // Deliberately not splitting on a dash: it's as likely to precede the part
  // that identifies the venue as to follow it, and "Vue Cinema London -
  // Westfield Stratford" truncated to "Vue Cinema London" matches nothing.
  // Must stay in step with discover-venues.js, which reports on the same names.
  const [venueName] = (name || "").split(/[,|]/);

  // localized_address_display is like "265 Lavender Hill, London, SW11 1JB"
  return { venueName, coordinates: { lat, lon }, eventAddress };
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
  getEventVenue,
  getEventDescription,
  getEventStatus,
  getFestivalCollectionNotes,
};
