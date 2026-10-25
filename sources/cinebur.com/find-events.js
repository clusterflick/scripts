const path = require("node:path");
const { startOfMinute } = require("date-fns");
const {
  readJSON,
  generateShowingId,
  createOverview,
  createPerformance,
  createAccessibility,
  createFormat,
} = require("../../common/utils");
const { venueMatchesCinema } = require("../../common/source-utils");
const attributes = require("./attributes");

// A share link is minted per event by Branch inside the app, so there is no
// per-event URL to build - the booking link is Cinebur itself, where the app
// is.
const BOOKING_URL = attributes.url;

// Only a stated count says anything about stock. A missing one is unknown, not
// available, so it leaves the status empty rather than claiming either.
function getStatus({ ticket_availability: available }) {
  if (available === undefined) return {};
  return { soldOut: Number(available) === 0 };
}

function convertCineburEvent(event) {
  const id = event.path.split("/").at(-1);
  const { film } = event;

  // The event's own name is the night's billing - "SEVENTE CINÉ CLUB:
  // HALLOWEEN NIGHT" - with the film named in a field of its own, so the film
  // is the title and the billing goes to the notes.
  const title = event.film_name;
  const notes = event.name?.trim() !== title?.trim() ? event.name : undefined;

  // Stored to the millisecond as the app's picker left it - "18:01:00.812Z"
  const date = startOfMinute(new Date(event.event_date));

  return {
    showingId: generateShowingId(attributes, id),
    title,
    url: BOOKING_URL,
    overview: createOverview({
      duration: film?.runtime,
      year: film?.release_date,
      directors: film?.director_name,
      categories: film?.genre ? film.genre.split("/") : "",
      trailer: film?.trailer_link,
    }),
    performances: [
      createPerformance({
        date,
        notesList: [notes],
        url: BOOKING_URL,
        status: getStatus(event),
        accessibility: createAccessibility(title, {}, event.description),
        format: createFormat(title, {}, event.description),
      }),
    ],
    // The event's description is the app's boilerplate welcome, so the film's
    // synopsis is what tells a match apart.
    matchingHints: { overview: film?.description || event.description },
  };
}

/**
 * Find events matching a specific cinema
 */
async function findEvents(cinema) {
  const dataSrc = path.join(process.cwd(), "retrieved-data", "cinebur.com");

  let events = [];
  try {
    const data = await readJSON(dataSrc);
    events = data.events || [];
  } catch {
    // Source data may not always be available or required
  }

  return (
    events
      // Without a venue an event can't be placed. Cinebur's own "pop-up here"
      // placeholders do carry one - "Unique Locations", at "London, UK" - and
      // are left out by matching no venue of ours.
      .filter(({ venue }) => venue)
      .filter(({ venue }) =>
        venueMatchesCinema(
          cinema,
          venue.name,
          { lat: venue.location.latitude, lon: venue.location.longitude },
          { eventAddress: venue.address },
        ),
      )
      .map(convertCineburEvent)
  );
}

module.exports = findEvents;
