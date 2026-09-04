const { getText } = require("../../common/utils");

const sanitizeDatetime = ($timeEl) => {
  const datetime = $timeEl.attr("datetime");
  if (!datetime || !datetime.endsWith("Z")) return datetime;

  const isoMatch = datetime.match(/T(\d{2}):(\d{2})/);
  if (!isoMatch) return datetime;

  const timeText = getText($timeEl).toLowerCase();
  const textMatch = timeText.match(/^(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)$/);
  if (!textMatch) return datetime;

  let textHours = parseInt(textMatch[1], 10);
  const textMinutes = parseInt(textMatch[2] || "0", 10);
  const period = textMatch[3];
  if (period === "pm" && textHours !== 12) textHours += 12;
  if (period === "am" && textHours === 12) textHours = 0;

  const isoHours = parseInt(isoMatch[1], 10);
  const isoMinutes = parseInt(isoMatch[2], 10);

  if (isoHours === textHours && isoMinutes === textMinutes) {
    return datetime.slice(0, -1);
  }

  return datetime;
};

const getParams = (page) =>
  new URLSearchParams({
    // Filters to just cinema
    "af[16]": 16,
    // Parameters required for drupal_ajax
    view_name: "event_calendar",
    view_display_id: "page",
    view_dom_id: "dom-id",
    "ajax_page_state[libraries]": "none",
    // Pagination
    page,
  });

const convertDurationStringToMinutes = (duration) => {
  if (!duration) return undefined;

  const normalized = duration
    .toLowerCase()
    .replace("approx", "")
    .replace("programme length:", "")
    .trim();

  const hrsAndMins = normalized.match(
    /^(?:(\d+)\s*ho?u?r?s?[,\s]+)?(\d+)\s*mi?n?s?/,
  );
  if (hrsAndMins) {
    return (
      parseInt(hrsAndMins[1] || "0", 10) * 60 + parseInt(hrsAndMins[2], 10)
    );
  }

  const hrsOnly = normalized.match(/^(\d+)\s*ho?u?r?s?/);
  if (hrsOnly) return parseInt(hrsOnly[1], 10) * 60;

  const minsOnly = normalized.match(/^(\d+)\s*mi?n?s?/);
  if (minsOnly) return parseInt(minsOnly[1], 10);

  throw new Error(`Unrecognised duration format: "${duration}"`);
};

// The Barbican advertises accessibility provisions at event level - both in the
// "These accessibility provisions are available for this event" panel and in the
// ticketing product name - as a roll-up over every date the event has covered.
// It does not shrink as dates pass, so an event whose only captioned screening
// has already happened carries on advertising captions. Event-level provisions
// can only be attributed to a performance when the event has exactly one.
//
// The byline is what makes that safe to establish, because it describes the
// event rather than the dates still on sale. A run renders both ends of its
// original range ("Fri 29 May — Thu 16 Jul 2026") even once a single date is
// left, and a single day holding two showings renders the date on its own
// ("Wed 23 Sep 2026"). Only a genuine one-off renders a time of day.
const isOneOffEventByline = ($) => {
  const $bylineTime = $(".event-byline__date time");
  if ($bylineTime.length !== 1) return false;
  return /,\s*\d{1,2}:\d{2}$/.test(getText($bylineTime));
};

// A listing carries its event id on the "save this event" button, and the
// Barbican leaves that button off an event it has archived - there is nothing
// left to save on a cancelled run. Such a listing has no id to look up and no
// performances behind it, so it is dropped rather than followed to
// /node/undefined. This is the only reason a listing legitimately has no id:
// a listing missing the button without the label is a markup change, and
// retrieve throws on it rather than quietly dropping a film that is on sale.
const isArchivedListing = ($listing) =>
  $listing.find(".search-listing__label--archived").length > 0;

// Names of the event's ticketing products, read from the analytics dataLayer.
// They spell out provisions the listing markup leaves off, e.g. "Outdoor
// Cinema: Weathering With You (12A) (AD & Captioned)". An event with no
// products makes no claim - absence means no provisions to add, not an error.
const getTicketProductNames = ($) => {
  const dataLayer = $("script")
    .map((i, el) => $(el).html())
    .get()
    .find((contents) => contents && contents.includes("var dataLayer"));
  const match = dataLayer?.match(/var dataLayer\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) return [];
  return JSON.parse(match[1]).flatMap(({ eventInfo = [] }) =>
    eventInfo.map(({ name }) => name),
  );
};

const getYear = (value) => value.match(/^(?:[^\s]+\s+)?(\d{4})\s+\w/i)?.[1];

const getDirectorDuration = (value) => {
  const match = value.match(/dirs?\.?\s+([^\d]+?)(\d+)\s*min/i);
  if (!match) return {};
  return { director: match[1], duration: match[2] };
};

module.exports = {
  getParams,
  convertDurationStringToMinutes,
  getYear,
  getDirectorDuration,
  sanitizeDatetime,
  isOneOffEventByline,
  getTicketProductNames,
  isArchivedListing,
};
