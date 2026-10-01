const { parseISO } = require("date-fns");
const {
  generateShowingId,
  createPerformance,
  createOverview,
  createAccessibility,
  createFormat,
} = require("../../common/utils");
const { isFilmEvent } = require("../../common/is-film-event");
const sourceOnlyTransform = require("../../common/source-only/transform");
const attributes = require("./attributes");

// The studio's own programme is mostly not film - yard sales sit alongside the
// Saturday film nights and NT Live screenings - and Wix gives none of them a
// category, so the listing has to say for itself that a film is being shown.
const isFilmListing = ({ title, description }) =>
  isFilmEvent(`${title} ${description}`);

function getStartDate({ title, scheduling }) {
  const { scheduleTbd, startDate, recurrences } = scheduling.config;
  if (scheduleTbd || !startDate) {
    throw new Error(`No start date for "${title}"`);
  }
  // Wix lists each date of a recurring event as an event of its own, with an
  // empty occurrences list. Anything else is a shape we haven't seen.
  if (recurrences?.occurrences?.length) {
    throw new Error(`Unexpected recurrence on "${title}"`);
  }
  return parseISO(startDate);
}

async function transform({ events }, sourcedEvents) {
  const movies = events.filter(isFilmListing).map((event) => {
    const { id, title, description, slug, registration } = event;
    // The path the events page links each event's "Buy Tickets" button to.
    const url = `${attributes.domain}/event-details-registration/${slug}`;
    const overview = description.replace(/\s+/g, " ").trim();

    return {
      showingId: generateShowingId(attributes, id),
      title,
      url,
      // The event's end time is when the room closes rather than when the
      // film does, so it isn't published as a duration.
      overview: createOverview({}),
      performances: [
        createPerformance({
          date: getStartDate(event),
          url,
          accessibility: createAccessibility(title, {}, overview),
          format: createFormat(title, {}, overview),
          status: { soldOut: registration?.ticketing?.soldOut === true },
        }),
      ],
      matchingHints: { overview },
    };
  });

  // An empty result is left to stand: between seasons the studio can have
  // nothing but yard sales on, and retrieve has already refused a page whose
  // events data is missing.
  //
  // Before it had a site of its own the venue was source-only, so whatever the
  // ticketing platforms still list for it is carried as before.
  return movies.concat(await sourceOnlyTransform({}, sourcedEvents));
}

module.exports = transform;
