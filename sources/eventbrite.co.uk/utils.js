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

module.exports = {
  parseDate,
  getEventVenue,
  getEventDescription,
};
