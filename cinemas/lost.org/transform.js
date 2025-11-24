const cheerio = require("cheerio");
const {
  generateShowingId,
  createOverview,
  createPerformance,
  getText,
} = require("../../common/utils");
const { parse, isBefore, startOfDay, addYears } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const attributes = require("./attributes");

async function transform({ movieListPage }, sourcedEvents) {
  const movies = [];
  const $ = cheerio.load(movieListPage);

  $(".listing").each(function () {
    const $listing = $(this);
    const url = `https://tickets.lost.org${$listing.find("a").attr("href")}`;

    const eventName = getText($listing.find(".event_name"));
    const eventMatch = eventName.match(
      /^(.+?)\s+\(([^,]+),\s*(\d{4})\)\s+(.+?)\s+lost\s+cinema$/i,
    );
    if (!eventMatch) {
      throw new Error(`Could not parse event: ${eventName}`);
    }
    const [, title, director, year, timeStr] = eventMatch;

    // Extract date components
    const dayOfMonth = getText($listing.find(".event_date var"));
    const month = getText($listing.find(".event_date span[isolate]").last());
    let normalizedTime = timeStr;
    if (!/:\d{2}/.test(normalizedTime)) {
      normalizedTime = normalizedTime.replace(/(\d+)(am|pm)/i, "$1:00$2");
    }
    const dateString = `${dayOfMonth} ${month} ${normalizedTime}`;
    let date = parse(dateString, "d MMM h:mma", new Date(), {
      locale: enGB,
    });

    if (isNaN(date.getTime())) {
      throw new Error(`Unable to parse date: ${dateString}`);
    }

    // If the date is in the past, then it's probably on the year boundary
    // and we need to add a year
    const today = startOfDay(new Date());
    if (isBefore(date, today)) {
      date = addYears(date, 1);
    }

    const eventIdMatch = url.match(/\/id\/(\d+)\//);
    const showingId = generateShowingId(attributes, eventIdMatch[1]);

    const movie = {
      showingId,
      title: title.trim(),
      url,
      overview: createOverview({
        year,
        directors: director.trim(),
      }),
      performances: [createPerformance({ date, url })],
      matchingHints: {},
    };

    movies.push(movie);
  });

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
