const {
  createPerformance,
  createOverview,
  generateShowingId,
  createAccessibility,
} = require("../../common/utils");
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
  return keywords.includes("cinema") || keywords.includes("film");
}

function getDurationMins(startDate, endDate) {
  if (!startDate || !endDate) return undefined;
  const durationMs = endDate.getTime() - startDate.getTime();
  return durationMs / 1000 / 60;
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
      title: event.event_title,
      url: eventUrl,
      overview: createOverview({ duration }),
      performances: [
        createPerformance({
          date: startDate,
          url: eventUrl,
          screen: event.event_venue,
          status: event.isSoldOut ? { soldOut: true } : {},
          accessibility: createAccessibility(event.event_title, {}),
        }),
      ],
      matchingHints: {
        overview: event.event_summary || event.event_description || "",
      },
    });
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
