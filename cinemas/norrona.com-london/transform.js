const {
  createAccessibility,
  createFormat,
  createOverview,
  createPerformance,
  generateShowingId,
} = require("../../common/utils");
const attributes = require("./attributes");
const { parseEventPage, isFilmEvent } = require("./utils");

const SCHEDULED = "https://schema.org/EventScheduled";
const CANCELLED = "https://schema.org/EventCancelled";

async function transform({ eventPages }, sourcedEvents) {
  const movies = Object.entries(eventPages)
    .map(([url, html]) => ({ url, ...parseEventPage(html) }))
    // The store page lists this store's events, but each page says so too
    .filter(({ store }) => store === attributes.name)
    .filter(({ eventStatus }) => {
      if (eventStatus === CANCELLED) return false;
      if (eventStatus && eventStatus !== SCHEDULED) {
        throw new Error(`Unrecognised event status: ${eventStatus}`);
      }
      return true;
    })
    .filter(isFilmEvent)
    .map(({ url, title, description, text, startDate }) => {
      const overview = [description, text].filter(Boolean).join("\n");
      return {
        showingId: generateShowingId(attributes, url.split("/").pop()),
        title,
        url,
        overview: createOverview({}),
        performances: [
          createPerformance({
            date: new Date(startDate),
            url,
            accessibility: createAccessibility(title, {}, overview),
            format: createFormat(title, {}, overview),
          }),
        ],
        matchingHints: { overview },
      };
    });

  return movies.concat(Object.values(sourcedEvents).flat());
}

module.exports = transform;
