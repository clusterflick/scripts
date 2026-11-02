const cheerio = require("cheerio");
const { parse } = require("date-fns");

const HEADER =
  /^(\d{2}\.\d{2}\.\d{2})\s*\|\s*(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)?\s*(?:-\s*(\d{1,2})(?:[.:]\d{2})?\s*(am|pm))?$/i;
const SOLD_OUT = /\*?\s*sold out\s*\*?/i;

const collapse = (value) => value.replace(/\s+/g, " ").trim();

const to24Hour = (hour, period) =>
  (hour % 12) + (period.toLowerCase() === "pm" ? 12 : 0);

// "6-9pm" and "12-6pm" put the am/pm on the end of the range only. A start
// that would then come after the end ("11-6pm") must be the other half of the day.
const getStartTime = (hour, minute, startPeriod, endHour, endPeriod) => {
  if (startPeriod) return [to24Hour(hour, startPeriod), minute];
  if (!endPeriod) return null;
  const sameHalf = to24Hour(hour, endPeriod);
  return [
    sameHalf > to24Hour(endHour, endPeriod)
      ? to24Hour(hour, endPeriod.toLowerCase() === "pm" ? "am" : "pm")
      : sameHalf,
    minute,
  ];
};

const parseHeader = (line) => {
  const found = line.match(HEADER);
  if (!found) return null;
  const [, day, hour, minute = "00", startPeriod, endHour, endPeriod] = found;
  const start = getStartTime(
    Number(hour),
    minute,
    startPeriod,
    Number(endHour),
    endPeriod,
  );
  if (!start) return null;
  const date = parse(
    `${day} ${start[0]}:${start[1]}`,
    "dd.MM.yy H:mm",
    new Date(),
  );
  return Number.isNaN(date.getTime()) ? null : date;
};

// Upcoming Events is a run of Beaver Builder modules: a text block per event
// whose first paragraph is "date | time" then the title, a button if there is
// somewhere to book, then a separator. A text block that opens any other way
// means the layout has changed and a film could be hiding in it.
const parseEvents = (html) => {
  const $ = cheerio.load(html);
  const heading = $("h2.fl-heading")
    .toArray()
    .find((h2) => collapse($(h2).text()).toUpperCase() === "UPCOMING EVENTS");
  if (!heading) {
    throw new Error("No Upcoming Events heading found - has the page changed?");
  }

  const events = [];
  $(heading)
    .nextAll(".fl-col-group")
    .first()
    .find(".fl-module")
    .each(function () {
      const $module = $(this);
      if ($module.hasClass("fl-module-rich-text")) {
        const $first = $module.find("p").first().clone();
        $first.find("br").replaceWith("\n");
        const lines = $first.text().split("\n").map(collapse).filter(Boolean);
        const date = parseHeader(lines[0] || "");
        const rawTitle = lines.slice(1).join(" ");
        if (!date || !rawTitle) {
          throw new Error(
            `Event breaks the date/title pattern: ${collapse($module.text()).slice(0, 200)}`,
          );
        }
        $module.find("br").replaceWith("\n");
        events.push({
          date,
          title: collapse(rawTitle.replace(SOLD_OUT, " ")),
          soldOut: SOLD_OUT.test(rawTitle),
          text: $module.text().trim(),
        });
      } else if ($module.hasClass("fl-module-button") && events.length > 0) {
        events[events.length - 1].bookingUrl = $module.find("a").attr("href");
      }
    });
  return events;
};

// There is no film label on this page, only the event's own words - and a talk
// about film would get through, which is what the categoriser is there for.
const isFilmEvent = ({ title, text }) =>
  /\b(film|screening)\b/i.test(`${title} ${text}`);

module.exports = { parseEvents, isFilmEvent };
