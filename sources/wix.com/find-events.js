const path = require("node:path");
const {
  createOverview,
  createPerformance,
  createAccessibility,
  createOccasions,
  createFormat,
  generateShowingId,
  readJSON,
} = require("../../common/utils");
const { venueMatchesCinema } = require("../../common/source-utils");
const attributes = require("./attributes");
const SITES = require("./sites");
const { getRichText } = require("./utils");

// The page state writes Wix's enums as numbers, in the order the Events SDK
// declares them (`Status`, `LocationType`, `RegistrationStatusStatus`).
const EVENT_STATUS = {
  UPCOMING: 0,
  STARTED: 1,
  ENDED: 2,
  CANCELED: 3,
  DRAFT: 4,
};
const LISTED_STATUSES = new Set([EVENT_STATUS.UPCOMING, EVENT_STATUS.STARTED]);
const LOCATION_TYPE = { VENUE: 0, ONLINE: 1 };
// Registration closes itself once the tickets are gone.
const REGISTRATION_CLOSED_AUTOMATICALLY = 1;

const getSite = (domain) => {
  const site = SITES.find((entry) => entry.domain === domain);
  if (!site) throw new Error(`Wix event retrieved for unknown site ${domain}`);
  return site;
};

function isListed({ event, url }) {
  if (!Object.values(EVENT_STATUS).includes(event.status)) {
    throw new Error(`Unknown Wix event status ${event.status} for ${url}`);
  }
  return LISTED_STATUSES.has(event.status);
}

function isAtCinema({ event, url }, cinema) {
  const { location } = event;
  if (!Object.values(LOCATION_TYPE).includes(location?.type)) {
    throw new Error(`Unknown Wix location type ${location?.type} for ${url}`);
  }
  if (location.type !== LOCATION_TYPE.VENUE || location.tbd) return false;

  // The structured `fullAddress` can't be trusted - Super Shorts' sessions at
  // BFI Stephen Street carry a Sclater Street postcode there - so the address
  // the organiser typed is the one given for the postcode fallback.
  const coordinates = location.coordinates
    ? { lat: location.coordinates.lat, lon: location.coordinates.lng }
    : null;
  return venueMatchesCinema(cinema, location.name, coordinates, {
    eventAddress: location.address,
  });
}

function convertWixEvent({ domain, url, event }) {
  const { note, filmOrganiser } = getSite(domain);
  const { config } = event.scheduling;

  // A recurring event lists its dates here; none has been seen yet, so its
  // shape is unknown rather than guessed at.
  if (config.recurrences?.occurrences?.length) {
    throw new Error(`Recurring Wix events aren't supported yet: ${url}`);
  }
  if (config.scheduleTbd || !config.startDate) {
    throw new Error(`No start date for the Wix event ${url}`);
  }

  const start = new Date(config.startDate);
  const end = config.endDate ? new Date(config.endDate) : undefined;
  const title = event.title;
  const description = getRichText(event.longDescription);
  const { registration } = event;
  const soldOut =
    registration?.ticketing?.soldOut === true ||
    registration?.status === REGISTRATION_CLOSED_AUTOMATICALLY;

  return {
    showingId: generateShowingId(attributes, event.id),
    title,
    url,
    overview: createOverview({
      duration: end ? Math.round((end - start) / 1000 / 60) : undefined,
    }),
    performances: [
      createPerformance({
        date: start,
        url,
        status: { soldOut },
        notesList: note ? [note] : [],
        accessibility: createAccessibility(title, {}, description),
        format: createFormat(title, {}, description),
        occasions: createOccasions(title, {}, description, { date: start }),
      }),
    ],
    // An empty overview makes the matching LLM discard the event outright.
    matchingHints: {
      overview: description || title,
      ...(filmOrganiser ? { filmOrganiser: true } : {}),
    },
  };
}

async function findEvents(cinema) {
  const dataSrc = path.join(process.cwd(), "retrieved-data", attributes.id);

  let events = [];
  try {
    const data = await readJSON(dataSrc);
    events = Object.values(data.events || {});
  } catch {
    // Source data may not always be available or required
  }

  return events
    .filter(isListed)
    .filter((entry) => isAtCinema(entry, cinema))
    .map(convertWixEvent);
}

module.exports = findEvents;
