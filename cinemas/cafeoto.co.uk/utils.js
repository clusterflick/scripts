const { parse } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");

// Film at Café OTO is billed in the title - "Sonic Cinema: ...", "... + film
// screening: '...'" - since the venue has no film category to file it under.
const filmPattern =
  /\b(?:films?|cinema|screenings?|movies?|16mm|35mm|super ?8)\b/i;

const isFilmEvent = (text) => filmPattern.test(text);

// "Sunday 11 October 2026, 7.30pm", "Sunday 11 October 2026, 2–5pm" or
// "Thursday 29 October 2026, 7.30–11pm". A start time without its own am/pm
// shares the end time's.
const datePattern =
  /^\w+day (\d{1,2} \w+ \d{4}), (\d{1,2})(?:\.(\d{2}))?\s*(am|pm)?(?:\s*[–-]\s*\d{1,2}(?:\.\d{2})?\s*(am|pm))?$/i;

const parseEventDate = (dateText) => {
  const match = dateText.trim().match(datePattern);
  if (!match) {
    throw new Error(`Unable to parse event date: ${dateText}`);
  }
  const [, day, hours, minutes = "00", startMeridiem, endMeridiem] = match;
  const meridiem = startMeridiem || endMeridiem;
  if (!meridiem) {
    throw new Error(`No am/pm in event date: ${dateText}`);
  }
  const date = parse(
    `${day} ${hours}:${minutes}${meridiem.toLowerCase()}`,
    "d MMMM yyyy h:mmaaa",
    new Date(),
    { locale: enGB },
  );
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Unable to parse event date: ${dateText}`);
  }
  return date;
};

module.exports = {
  isFilmEvent,
  parseEventDate,
};
