const {
  createPerformance,
  createOverview,
  generateShowingId,
  createAccessibility,
  createOccasions,
  createFormat,
} = require("../../common/utils");
const attributes = require("./attributes");

async function transform({ screenings }, sourcedEvents) {
  const movies = [];

  for (const screening of screenings) {
    const { film } = screening;
    const showingId = generateShowingId(attributes, screening.id);
    const bookingUrl = `${attributes.domain}/screening/${screening.id}`;
    const hasDirector = film.director && film.director !== "?";
    const soldOut = screening.ticketsSold >= screening.capacity;
    const hasValidYear = /^\d{4}$/.test(`${film.year}`);

    const notesList = [];
    if (screening.doorsTime) {
      notesList.push(`Doors ${screening.doorsTime}`);
    }

    const date = new Date(screening.screeningDate);
    movies.push({
      showingId,
      title: film.title,
      url: bookingUrl,
      overview: createOverview({
        duration: film.runtime,
        year: hasValidYear ? `${film.year}` : undefined,
        directors: hasDirector ? film.director : undefined,
        classification: film.ageCertificate,
      }),
      performances: [
        createPerformance({
          date,
          notesList,
          url: bookingUrl,
          status: soldOut ? { soldOut } : undefined,
          accessibility: createAccessibility(film.title, {}, film.description),
          format: createFormat(film.title, {}, film.description),
          occasions: createOccasions(film.title, {}, film.description, {
            date,
          }),
        }),
      ],
      matchingHints: { overview: film.description },
    });
  }

  if (movies.length === 0) {
    throw new Error("No movies found. Has the page data changed?");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
