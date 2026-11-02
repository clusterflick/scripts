const cheerio = require("cheerio");
const { differenceInDays, getDay, parse } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const {
  createAccessibility,
  createFormat,
  createOverview,
  createPerformance,
  generateShowingId,
} = require("../../common/utils");
const attributes = require("./attributes");
const { parseListings, isFilmListing, getListedDates } = require("./utils");

// "2 November 2026, 4-6pm", "Thursday 12 November, 7pm"
const EVENT_DATE =
  /(?:\b([A-Z][a-z]+day)\s+)?\b(\d{1,2})\s+([A-Z][a-z]+)(?:\s+(\d{4}))?,\s*(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)?(?:\s*[-–]\s*\d{1,2}(?:[.:]\d{2})?\s*(am|pm))?/;

const parseDay = (day, month, year) =>
  parse(`${day} ${month} ${year}`, "d MMMM yyyy", new Date(), { locale: enGB });

const getEventText = ($) => {
  $("br").replaceWith("\n");
  return $.root().text();
};

// The listing never gives a year and some event pages don't either, so an
// undated event belongs to whichever year puts it closest to today. A weekday,
// where one is given, then has to agree.
const getEventDate = (text, title) => {
  const found = text.match(EVENT_DATE);
  if (!found) {
    throw new Error(`No date found on the event page for "${title}"`);
  }
  const [, weekday, day, month, year, hour, minute, startPeriod, endPeriod] =
    found;
  const period = startPeriod || endPeriod;
  if (!period) throw new Error(`No am/pm in the date for "${title}"`);

  const now = new Date();
  const candidates = year
    ? [Number(year)]
    : [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const dayOfEvent = candidates
    .map((candidate) => parseDay(day, month, candidate))
    .sort(
      (a, b) =>
        Math.abs(differenceInDays(a, now)) - Math.abs(differenceInDays(b, now)),
    )[0];

  if (
    weekday &&
    getDay(parse(weekday, "EEEE", new Date(), { locale: enGB })) !==
      getDay(dayOfEvent)
  ) {
    throw new Error(`"${found[0]}" for "${title}" names the wrong weekday`);
  }

  return parse(
    `${day} ${month} ${dayOfEvent.getFullYear()} ${hour}:${minute || "00"} ${period}`,
    "d MMMM yyyy h:mm a",
    new Date(),
    { locale: enGB },
  );
};

async function transform({ movieListPage, moviePages }, sourcedEvents) {
  const movies = parseListings(movieListPage)
    .filter(isFilmListing)
    .map((listing) => {
      const { href, title } = listing;
      const moviePage = moviePages[href];
      if (!moviePage) throw new Error(`No event page held for "${title}"`);

      const $ = cheerio.load(moviePage, null, false);
      const bookingUrl = $("a")
        .toArray()
        .find((a) => /rsvp|book|ticket/i.test($(a).text()));
      const text = getEventText($);
      const date = getEventDate(text, title);

      // The event page is what we read, so a listing that disagrees with it
      // means one of the two hand-typed dates is wrong and only a person can
      // say which.
      const [listedDate] = getListedDates(listing);
      const listedDay = listedDate?.match(/^(\d{1,2})\s+([A-Z][a-z]+)/);
      const listed =
        listedDay && parseDay(listedDay[1], listedDay[2], date.getFullYear());
      if (
        listed?.getDate() !== date.getDate() ||
        listed?.getMonth() !== date.getMonth()
      ) {
        throw new Error(
          `"${title}" is listed for "${listedDate}" but its page says ${date.toISOString()}`,
        );
      }

      const url = `${attributes.domain}/${href}`;
      const overview = text.split(/\n\s*RSVP\s*\n/)[0].trim();
      return {
        showingId: generateShowingId(attributes, href),
        title,
        url,
        overview: createOverview({}),
        performances: [
          createPerformance({
            date,
            url: bookingUrl ? $(bookingUrl).attr("href") : url,
            accessibility: createAccessibility(title, {}, overview),
            format: createFormat(title, {}, overview),
          }),
        ],
        matchingHints: { overview },
      };
    });

  return movies.concat(Object.values(sourcedEvents).flat());
}

module.exports = transform;
