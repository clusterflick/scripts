const cheerio = require("cheerio");
const {
  getText,
  createPerformance,
  createOverview,
  generateShowingId,
} = require("../../common/utils");
const { parseDate } = require("./utils");
const attributes = require("./attributes");

const infoMatcher = /^([^,]+),\s+(\d{4}),\s+(\d+)\s+min(\s+|$|,)/i;

const parseDetailsFrom = (info) => {
  const match = info.match(infoMatcher);
  if (!match) return {};
  const [, directors, year, duration] = match;
  return { directors, year, duration };
};

function checkPerformanceExists(performance, sourcedEvent, cinemaEvents) {
  return cinemaEvents.some((event) =>
    event.performances.some((existingPerf) => {
      const hasSameBookingUrl =
        existingPerf.bookingUrl === performance.bookingUrl;
      const hasSameOrigin =
        new URL(existingPerf.bookingUrl).origin ===
        new URL(performance.bookingUrl).origin;
      const hasSameTime = existingPerf.time === performance.time;
      const hasSameTitle = sourcedEvent.title === event.title;
      return (
        // If the performance has the same booking URL and time, it's a duplicate
        (hasSameBookingUrl && hasSameTime) ||
        // If the performance has the same title and origin and time, it's a duplicate
        // This is to handle the case where the performance has a different booking URL but the same title and time and from the same source
        (hasSameTitle && hasSameOrigin && hasSameTime)
      );
    }),
  );
}

function filterSourcedEvents(sourcedEvents, cinemaEvents) {
  const deduplicated = [];
  for (const sourcedEvent of sourcedEvents) {
    const newPerformances = sourcedEvent.performances.filter(
      (performance) =>
        !checkPerformanceExists(performance, sourcedEvent, cinemaEvents),
    );

    // Only add the event if it has new performances
    if (newPerformances.length > 0) {
      deduplicated.push({ ...sourcedEvent, performances: newPerformances });
    }
  }
  return deduplicated;
}

async function transform({ moviePages }, sourcedEvents) {
  const movies = [];

  Object.keys(moviePages).forEach((url) => {
    const moviePage = moviePages[url];
    const $ = cheerio.load(moviePage);
    const $movieListing = $("#film_program_support");
    const titleText = getText($movieListing.find("h1").first());
    const [, ...titlePieces] = titleText.split(":");
    const title = titlePieces.join(":").trim();

    const $info = $movieListing
      .find("p:has(img:first-child:last-child)")
      .next();
    $info.find("strong").remove(); // Remove title if it's present
    const info = getText($info);
    const overview = createOverview(parseDetailsFrom(info));

    const performances = [];
    const $performanceRows = $(".booking_calender #addform tr#row");
    $performanceRows.each(function () {
      const $cells = $(this).find("td");
      const dateString = getText($cells.eq(1));
      const timeString = getText($cells.eq(2));
      const date = parseDate(`${dateString} @ ${timeString}`);
      const bookingUrl = $cells.eq(3).find("a").attr("href");
      performances.push(createPerformance({ date, url: bookingUrl || url }));
    });

    const hrefs = new Set(
      $performanceRows
        .map((i, el) => $(el).find("td a").eq(0).attr("href"))
        .get(),
    );
    const href = [...hrefs][0];
    const id =
      hrefs.size === 1 && href
        ? href.split("/close-up-cinema/")[1]
        : url.split("/film_programmes/")[1];
    const showingId = generateShowingId(attributes, id);
    movies.push({
      showingId,
      title,
      url,
      overview,
      performances,
      matchingHints: { overview: getText($("#film_program_support")) },
    });
  });

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );

  // Filter out duplicate performances from sourced events
  const deduplicatedSourcedEvents = filterSourcedEvents(
    listOfSourcedEvents,
    movies,
  );

  return movies.concat(deduplicatedSourcedEvents);
}

module.exports = transform;
