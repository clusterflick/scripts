const cheerio = require("cheerio");
const { parse, differenceInMinutes } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const {
  createPerformance,
  createOverview,
  generateShowingId,
  getText,
  basicNormalize,
  createAccessibility,
} = require("../../common/utils");
const attributes = require("./attributes");

function extractEventIdFromUrl(url) {
  const urlParts = url.split("/");
  return urlParts.at(-1) || urlParts.at(-2);
}

function parseDateText(dateText) {
  if (basicNormalize(dateText).includes("multiple dates")) {
    return null;
  }
  const [date, endTime] = dateText.split(" - ");
  const start = parse(date, "EEE d MMM yyyy h:mm a", new Date(), {
    locale: enGB,
  });
  const end = parse(endTime, "h:mm a", start, {
    locale: enGB,
  });
  return { start, end };
}

async function transform({ movieListPage }, sourcedEvents) {
  const $ = cheerio.load(movieListPage);

  const movies = [];

  // Parse each event from the listing page
  $(".events-listing__item").each((index, element) => {
    const $event = $(element);

    // Extract basic event information
    const title = getText($event.find(".event__title a"));
    const eventUrl = $event.find(".event__title a").attr("href");
    const dateText = getText($event.find(".event-meta__date"));
    const fullUrl = `https://www.tickettailor.com${eventUrl}`;
    const eventId = extractEventIdFromUrl(eventUrl);
    const parsedDate = parseDateText(dateText);

    // Skip events with multiple dates or unparseable dates for now
    if (!parsedDate) return;

    // Create the movie object
    movies.push({
      showingId: generateShowingId(attributes, eventId),
      title,
      url: fullUrl,
      overview: createOverview({
        duration: differenceInMinutes(parsedDate.end, parsedDate.start),
      }),
      performances: [
        createPerformance({
          date: parsedDate.start,
          url: fullUrl,
          status: {},
          accessibility: createAccessibility(title, {}),
        }),
      ],
      matchingHints: {
        overview: title,
      },
    });
  });

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
