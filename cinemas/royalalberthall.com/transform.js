const { parseISO } = require("date-fns");
const nlp = require("compromise");
const {
  createOverview,
  createPerformance,
  generateShowingId,
  getValidClassification,
  createAccessibility,
} = require("../../common/utils");
const attributes = require("./attributes");

function getCast(synopsis) {
  const doc = nlp(synopsis);
  const people = doc.people().json();
  if (people.length === 0) return;

  return people.map(({ text }) => text);
}

function extractYearFromCaption(caption) {
  if (!caption) return undefined;
  // Look for a 4-digit year in the caption
  const yearMatch = caption.match(/\b(\d{4})$/);
  if (!yearMatch) return undefined;
  return yearMatch[1];
}

function extractClassificationFromTitle(title) {
  const classificationMatch = title.match(/\s+\(([^)]+)\)$/);
  if (!classificationMatch) return undefined;
  return getValidClassification(classificationMatch[1]);
}

function parsePerformances(event) {
  return event.Performances.map((performance) => {
    const performanceDate = parseISO(performance.Date);

    return createPerformance({
      date: performanceDate,
      notesList: event.Suffix ? [event.Suffix] : [],
      url: event.BookingURL || `${attributes.domain}${event.EventURL}`,
      screen: event.Venue,
      accessibility: createAccessibility(event.Title, {}),
    });
  });
}

async function transform(allEvents, sourcedEvents) {
  const movies = [];

  // Filter to only film events
  const filmEvents = allEvents.filter(({ Categories: categories }) =>
    categories.includes("Film"),
  );

  for (const event of filmEvents) {
    const overview = createOverview({
      year: extractYearFromCaption(event.Image?.caption),
      classification: extractClassificationFromTitle(event.Title),
    });

    movies.push({
      showingId: generateShowingId(attributes, event.ID),
      title: event.Title,
      url: `${attributes.domain}${event.EventURL}`,
      overview,
      performances: parsePerformances(event),
      matchingHints: {
        overview: event.Summary,
        cast: event.Summary ? getCast(event.Summary) : undefined,
      },
    });
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
