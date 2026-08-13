const cheerio = require("cheerio");
const {
  getText,
  createOverview,
  generateShowingId,
} = require("../../common/utils");
const attributes = require("./attributes");
const ticketTailorAttributes = require("../../sources/tickettailor.com/attributes");

// The booking widget falls back to a plain link when its script doesn't run,
// which is how we get at the Ticket Tailor event without a browser. Two links
// sit in that fallback - the venue's own white-label box office
// (tickets.ibraaz.org/events/ibraaz/2346963/select-date) and Ticket Tailor's
// "sell tickets online" advert - so match the event path rather than taking the
// first link, and read the id from the path rather than its last segment.
const EVENT_ID_PATTERN = /\/events\/[^/]+\/(\d+)(?:[/?#]|$)/;

const getTicketTailorEventId = ($) => {
  const hrefs = $(".tt-widget-fallback a")
    .map((index, element) => $(element).attr("href"))
    .get();

  for (const href of hrefs) {
    const match = href?.match(EVENT_ID_PATTERN);
    if (match) return match[1];
  }

  return undefined;
};

// The summary list pairs a label with its value ("Location:" / "Minassa").
// Ibraaz screens in a named room rather than a numbered screen.
const getSummaryValue = ($, label) => {
  const $item = $(".split__details .summary__item").filter(
    (index, element) =>
      getText($(element).find("dt")).toLowerCase() === `${label}:`,
  );
  return getText($item.find("dd"));
};

function parseMovie(url, moviePage) {
  const $ = cheerio.load(moviePage);

  const title = getText($("h1.headline"));
  if (!title) {
    throw new Error(
      `No title found for ${url} - the page structure may have changed`,
    );
  }

  return {
    title,
    // The line under the title on a film page is the filmmaker.
    directors: getText($(".hero__inner p.line--bold")),
    overview: getText($(".richtext").first()).replace(/\s+/g, " "),
    screen: getSummaryValue($, "location"),
    eventId: getTicketTailorEventId($),
  };
}

async function transform({ moviePages }, sourcedEvents) {
  const ticketTailorEvents = sourcedEvents[ticketTailorAttributes.id] ?? [];
  const eventsByShowingId = new Map(
    ticketTailorEvents.map((event) => [event.showingId, event]),
  );

  const movies = [];
  for (const [moviePageUrl, moviePage] of Object.entries(moviePages)) {
    const { title, directors, overview, screen, eventId } = parseMovie(
      moviePageUrl,
      moviePage,
    );

    // Ticket Tailor is the only side with the year, the time and whether a
    // screening has sold out - the site's own listing says "Sunday 16 Aug,
    // 3-5pm" with no year at all - so a film we can't tie to its event has
    // nothing publishable behind it.
    if (!eventId) {
      throw new Error(
        `No Ticket Tailor booking link found for "${title}" (${moviePageUrl})`,
      );
    }

    const showingId = generateShowingId(ticketTailorAttributes, eventId);
    const sourcedEvent = eventsByShowingId.get(showingId);
    if (!sourcedEvent) {
      throw new Error(
        `No Ticket Tailor event ${eventId} for "${title}" (${moviePageUrl}) - the retrieved source data is incomplete`,
      );
    }

    movies.push({
      showingId: generateShowingId(attributes, eventId),
      title,
      url: moviePageUrl,
      overview: {
        ...createOverview({ directors }),
        // Only Ticket Tailor gives an end time, so its duration is the one
        // that survives.
        duration: sourcedEvent.overview.duration,
      },
      // The event's performances already carry the booking URL, status and the
      // accessibility and format read off the listing; the room they screen in
      // is the one thing only the venue's own page knows.
      performances: sourcedEvent.performances.map((performance) => ({
        ...performance,
        screen: screen || undefined,
      })),
      matchingHints: { overview },
    });
  }

  if (movies.length === 0) {
    throw new Error("No movies found - the page structure may have changed");
  }

  // Sourced events with no film page of their own are deliberately dropped:
  // Ibraaz sells talks, workshops and performances through the same Ticket
  // Tailor box office, and the site's film category is the only thing that
  // tells them apart. A film the site hasn't published yet arrives on the run
  // after it does.
  return movies;
}

module.exports = transform;
