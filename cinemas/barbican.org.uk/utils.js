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

  const hrsAndMinsString = duration
    .trim()
    .match(/^(?:(\d+)\s*ho?u?r?s?,?\s+?)?(\d+)\s*mi?n?s?/i);
  const hoursString = duration.trim().match(/^(\d+)\s*ho?u?rs?/i);
  const [, hours = 0, minutes = 0] = hrsAndMinsString || hoursString;
  return parseInt(hours, 10) * 60 + parseInt(minutes, 10);
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
};
