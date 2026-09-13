const { parseISO } = require("date-fns");
const {
  createOverview,
  createPerformance,
  generateShowingId,
  getValidClassification,
  createAccessibility,
  createFormat,
} = require("../../common/utils");
const { extractPeopleNames } = require("../../common/extract-people");
const { getExpectedClosure } = require("../../common/expected-closures");
const attributes = require("./attributes");

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
      accessibility: createAccessibility(event.Title, {}, event.Summary),
      format: createFormat(event.Title, {}, event.Summary),
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
    // An event is listed before it goes on sale, and the feed carries it with
    // an empty `Performances` until it does - so skip it rather than throw.
    // Skipping is also what lets the assertion below see the feed dropping
    // every date at once, which is otherwise invisible from in here: a film
    // with no performances gets built and pushed perfectly happily, and is
    // then dropped by `sortAndFilterMovies` long after this has returned.
    const performances = parsePerformances(event);
    if (performances.length === 0) continue;

    const overview = createOverview({
      year: extractYearFromCaption(event.Image?.caption),
      classification: extractClassificationFromTitle(event.Title),
    });

    movies.push({
      showingId: generateShowingId(attributes, event.ID),
      title: event.Title,
      url: `${attributes.domain}${event.EventURL}`,
      overview,
      performances,
      matchingHints: {
        overview: event.Summary,
        cast: extractPeopleNames(event.Summary),
      },
    });
  }

  if (movies.length === 0) {
    // The Hall's dates come from its box office, so an outage there empties
    // every event's `Performances` while the films stay listed and on sale -
    // the same empty output a changed feed would give. Stand down only for a
    // declared closure, and say which one, so the empty output is explained in
    // the log rather than silent.
    const closure = getExpectedClosure(attributes.id);
    if (!closure) {
      throw new Error("No movies found - the page structure may have changed");
    }
    console.log(
      `      - ⚠️  No listings for ${attributes.id} - closed until ${closure.until} for ${closure.reason}`,
    );
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
