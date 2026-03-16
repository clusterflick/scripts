const cheerio = require("cheerio");
const {
  getText,
  createPerformance,
  createOverview,
  generateShowingId,
  createAccessibility,
} = require("../../common/utils");
const normalizeTitle = require("../../common/normalize-title");
const { parseDate } = require("./utils");
const attributes = require("./attributes");

const infoMatcher = /^([^,]+),\s+(\d{4}),\s+(\d+)\s+min(\s+|$|,)/i;

const getTicketSourceId = (url) => url.split("/close-up-cinema/")[1];

// Returns corrected { id, url } when a venue links to the wrong booking page
const bookingCorrections = [
  {
    title: "Clay + Lunar Visions II",
    wrongId: "e-grbzlo",
    correctId: "t-lddxzxd",
  },
];

function getCorrectBooking(title, id) {
  const correction = bookingCorrections.find(
    (c) =>
      normalizeTitle(title) === normalizeTitle(c.title) && id === c.wrongId,
  );
  if (!correction)
    return { id, url: `https://www.ticketsource.co.uk/close-up-cinema/${id}` };
  return {
    id: correction.correctId,
    url: `https://www.ticketsource.co.uk/close-up-cinema/${correction.correctId}`,
  };
}

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
      const hasSameTitle =
        normalizeTitle(sourcedEvent.title) === normalizeTitle(event.title);
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
    const description = getText($("#film_program_support"));

    const performances = [];
    const $performanceRows = $(".booking_calender #addform tr#row");
    $performanceRows.each(function () {
      const $cells = $(this).find("td");
      const dateString = getText($cells.eq(1));
      const timeString = getText($cells.eq(2));
      const date = parseDate(`${dateString} @ ${timeString}`);
      const rawBookingUrl = $cells.eq(3).find("a").attr("href");
      const ticketSourceId = getTicketSourceId(rawBookingUrl);
      const bookingUrl = ticketSourceId
        ? getCorrectBooking(title, ticketSourceId).url
        : rawBookingUrl;
      const accessibility = createAccessibility(title, {}, description);
      performances.push(
        createPerformance({ date, url: bookingUrl || url, accessibility }),
      );
    });

    const hrefs = new Set(
      $performanceRows
        .map((i, el) => $(el).find("td a").eq(0).attr("href"))
        .get(),
    );
    const href = [...hrefs][0];
    const ticketSourceIdForEvent =
      hrefs.size === 1 && href ? getTicketSourceId(href) : null;
    const id = ticketSourceIdForEvent
      ? getCorrectBooking(title, ticketSourceIdForEvent).id
      : url.split("/film_programmes/")[1];
    const showingId = generateShowingId(attributes, id);
    movies.push({
      showingId,
      title,
      url,
      overview,
      performances,
      matchingHints: { overview: description },
    });
  });

  if (movies.length === 0) {
    // The venue's website is behind a Cloudflare Turnstile challenge that
    // blocks automated retrieval. When that happens, we get empty `moviePages`
    // and fall back to events from the TicketSource source.
    // Only throw if TicketSource also has nothing, which would indicate a
    // genuine breakage rather than a Cloudflare block.
    const allSourcedEvents = Object.values(sourcedEvents).flatMap((e) => e);
    if (allSourcedEvents.length === 0) {
      throw new Error("No movies found - the page structure may have changed");
    }
    console.log(
      " - ⚠️  No movies from venue website - falling back to sourced events only",
    );
  }

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
