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
};
