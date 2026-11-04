const cheerio = require("cheerio");
const { parse, isValid } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");

const getEventUrl = (event) => `https://tzkrti.com/en/events/${event.id}`;

// Descriptions are HTML in both languages. The English one is read, as the
// rest of the event is.
const getHtmlText = (html) => {
  if (!html) return "";
  const $ = cheerio.load(html);
  $("br").replaceWith("\n");
  $("p, li").after("\n");
  return $.root()
    .text()
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
};

// `from_date` is not London time: every London event carries it two hours
// ahead of the time the event page shows (Asafeer: "2026-11-06 16:00" for a
// 6pm start), which looks like the platform's home zone, but nothing in the
// listing names that zone. `start_date` is the time as the event page shows
// it, formatted in the country's own zone (Europe/London), so it is the one
// read - in the pipeline's Europe/London timezone.
const START_DATE_FORMAT = "EEE, MMM d, yyyy h:mm a";

const getStartDate = (event) => {
  const date = parse(event.start_date, START_DATE_FORMAT, new Date(), {
    locale: enGB,
  });
  if (!isValid(date)) {
    throw new Error(
      `tzkrti event ${event.id} has an unparseable start_date: ${event.start_date}`,
    );
  }
  return date;
};

// `from_date` and `to_date` share whatever zone they're in, so their
// difference is the event's length even though neither is London time.
const LOCAL_DATE_FORMAT = "yyyy-MM-dd HH:mm";

const getDurationInMinutes = (event) => {
  const from = parse(event.from_date, LOCAL_DATE_FORMAT, new Date());
  const to = parse(event.to_date, LOCAL_DATE_FORMAT, new Date());
  if (!isValid(from) || !isValid(to)) {
    throw new Error(
      `tzkrti event ${event.id} has an unparseable from_date/to_date: ` +
        `${event.from_date} / ${event.to_date}`,
    );
  }
  return (to.getTime() - from.getTime()) / 1000 / 60;
};

module.exports = {
  getEventUrl,
  getHtmlText,
  getStartDate,
  getDurationInMinutes,
};
