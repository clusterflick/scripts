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

/**
 * Parse the PeopleVine date format: /Date(timestamp)/
 */
function parseDate(dateString) {
  const match = dateString.match(/\/Date\((\d+)\)\//);
  if (!match) return null;
  return new Date(parseInt(match[1], 10));
}

function isFilmEvent(event) {
  const keywords = (event.meta_keywords || "").toLowerCase();
  if (keywords.includes("cinema") || keywords.includes("film")) {
    return true;
  }

  const title = event.event_title.toLowerCase();
  if (title.includes("screening") || title.includes("film club")) {
    return true;
  }

  return false;
}

// event_date_end closes the event, which for a recurring strand is the last
// date it runs rather than the end of one sitting: "Family Film Club - Tuesday
// and Thursday" spans two days and subtracts out to 2,970 minutes. A figure
// like that is not a long film, it is the wrong quantity, so report nothing
// rather than a runtime no screening could have.
const LONGEST_PLAUSIBLE_SITTING_MINS = 8 * 60;

function getDurationMins(startDate, endDate) {
  if (!startDate || !endDate) return undefined;
  const durationMins = (endDate.getTime() - startDate.getTime()) / 1000 / 60;
  if (durationMins <= 0 || durationMins > LONGEST_PLAUSIBLE_SITTING_MINS) {
    return undefined;
  }
  return durationMins;
}

async function transform({ eventsData }, sourcedEvents) {
  const movies = [];

  const filmEvents = eventsData.filter(isFilmEvent);

  for (const event of filmEvents) {
    const showingId = generateShowingId(attributes, event.event_no);
    const startDate = parseDate(event.event_date);
    const endDate = parseDate(event.event_date_end);
    if (!startDate) throw new Error("No valid start date");
    const eventUrl = `${attributes.domain}/whats-on/event?event_no=${event.event_no}`;
    const duration = getDurationMins(startDate, endDate);

    movies.push({
      showingId,
      title: event.event_title.trim(),
      url: eventUrl,
      overview: createOverview({ duration }),
      performances: [
        createPerformance({
          date: startDate,
          url: eventUrl,
          screen: event.event_venue,
          status: event.isSoldOut ? { soldOut: true } : {},
          accessibility: createAccessibility(
            event.event_title,
            {},
            event.event_description,
          ),
          format: createFormat(event.event_title, {}, event.event_description),
        }),
      ],
      matchingHints: {
        overview: event.event_summary || event.event_description || "",
      },
    });
  }

  if (movies.length === 0) {
    // The retrieve stands down to an empty `eventsData` while the venue's
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
