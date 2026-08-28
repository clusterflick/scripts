const { parseISO } = require("date-fns");
const {
  createOverview,
  createPerformance,
  generateShowingId,
  createAccessibility,
  createFormat,
} = require("../../common/utils");
const parseDescription = require("../../common/eventive/parse-description");
const {
  getFilmMetadata,
  extractCategories,
  getTicketStatus,
} = require("../../common/eventive/get-event-details");
const attributes = require("./attributes");

async function transform({ movieListPage }, sourcedEvents) {
  const events = movieListPage.events.filter((event) => !event.is_virtual);

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

    const performance = createPerformance({
      date: parseISO(event.start_time),
      url: eventUrl,
      status: getTicketStatus(event),
      accessibility: createAccessibility(event.name, {}, matchingHintsText),
      format: createFormat(event.name, {}, matchingHintsText),
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
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
