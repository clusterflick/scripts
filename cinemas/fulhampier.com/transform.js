const { isNotNonFilmEvent } = require("../../common/is-non-film-event");
const { isNotSportShowing } = require("../../common/is-sport-showing");
const {
  createPerformance,
  createOverview,
  generateShowingId,
  createAccessibility,
  createFormat,
} = require("../../common/utils");
const { getExpectedClosure } = require("../../common/expected-closures");
const attributes = require("./attributes");
const { isFilmTitle, parseEventPage } = require("./utils");

const getDurationMins = (startDate, endDate) =>
  endDate ? (endDate.getTime() - startDate.getTime()) / 1000 / 60 : undefined;

async function transform({ eventPages }, sourcedEvents) {
  const movies = [];

  for (const [eventUrl, html] of Object.entries(eventPages)) {
    const { title, description, startDate, endDate, location, isSoldOut } =
      parseEventPage(html);
    // The retrieve picks events by the title on their card; the page's own
    // title has the last word.
    if (!isFilmTitle(title)) continue;

    const eventNo = new URL(eventUrl).searchParams.get("event_no");
    movies.push({
      showingId: generateShowingId(attributes, eventNo),
      title,
      url: eventUrl,
      overview: createOverview({
        duration: getDurationMins(startDate, endDate),
      }),
      performances: [
        createPerformance({
          date: startDate,
          url: eventUrl,
          screen: location,
          status: isSoldOut ? { soldOut: true } : {},
          accessibility: createAccessibility(title, {}, description),
          format: createFormat(title, {}, description),
        }),
      ],
      matchingHints: { overview: description },
    });
  }

  if (movies.length === 0) {
    // The retrieve stands down to an empty `eventPages` while the venue's
    // domain is unreachable, which arrives here as the same empty output a
    // changed page would give. Stand down only for a declared closure, and say
    // which one, so the empty output is explained in the log rather than
    // silent.
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
  return movies
    .filter(isNotSportShowing)
    .filter(isNotNonFilmEvent)
    .concat(listOfSourcedEvents);
}

module.exports = transform;
