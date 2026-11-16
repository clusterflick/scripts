const { parseISO } = require("date-fns");
const {
  createOverview,
  createPerformance,
  generateShowingId,
  createAccessibility,
  createOccasions,
  createFormat,
  removeAlreadyListedPerformances,
} = require("../../common/utils");
const parseDescription = require("../../common/eventive/parse-description");
const {
  getFilmMetadata,
  extractCategories,
  getTicketStatus,
  getBookingUrl,
} = require("../../common/eventive/get-event-details");
const attributes = require("./attributes");

async function transform({ movieListPage }, sourcedEvents) {
  // Undated events have no start time and aren't screenings - Eventive uses
  // them for things sold through the box office, like a book posted out
  const events = movieListPage.events.filter(
    (event) => !event.is_virtual && event.is_dated,
  );

  const movies = events.map((event) => {
    const { films = [] } = event;
    const filmMetadata = getFilmMetadata(films);
    const categories = extractCategories(event);

    const showingId = generateShowingId(attributes, event.id);
    const eventUrl = `${attributes.url}/schedule/${event.id}`;

    // Parse the event description for matching hints
    const eventDescription = parseDescription(event.description);
    const matchingHintsText = [filmMetadata.description, eventDescription]
      .filter((value) => !!value)
      .join("\n");

    const date = parseISO(event.start_time);
    const performance = createPerformance({
      date,
      url: getBookingUrl(event, eventUrl),
      status: getTicketStatus(event),
      accessibility: createAccessibility(event.name, {}, matchingHintsText),
      format: createFormat(event.name, {}, matchingHintsText),
      occasions: createOccasions(event.name, {}, matchingHintsText, { date }),
    });

    return {
      showingId,
      title: event.name,
      url: eventUrl,
      overview: createOverview({
        year: filmMetadata.year,
        duration: filmMetadata.duration,
        directors: filmMetadata.directors,
        actors: filmMetadata.actors,
        classification: filmMetadata.classification,
        categories,
        trailer: event.trailer_url,
      }),
      performances: [performance],
      matchingHints: {
        overview: matchingHintsText,
      },
    };
  });

  if (movies.length === 0) {
    throw new Error("No movies found - the page structure may have changed");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );

  // Sands sells through its own Eventive site, and gel.now lists some of its
  // screenings again with a link back there - to the season's page rather than
  // the screening's ("/Seasons/the-man-with-the-plan-..." against
  // "/schedule/<id>"), so it's the time and the booking host that match them.
  return movies.concat(
    removeAlreadyListedPerformances(movies, listOfSourcedEvents, {
      venueDomain: attributes.domain,
    }).filter(({ performances }) => performances.length > 0),
  );
}

module.exports = transform;
