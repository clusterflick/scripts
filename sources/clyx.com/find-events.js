const path = require("node:path");
const { differenceInMinutes } = require("date-fns");
const {
  createOverview,
  createPerformance,
  createAccessibility,
  createFormat,
  generateShowingId,
  readJSON,
  sanitizeRichText,
} = require("../../common/utils");
const attributes = require("./attributes");
const { venueMatchesCinema } = require("../../common/source-utils");
const normalizeVenueName = require("../../common/normalize-venue-name");

const eventUrl = (slug) => `https://clyx.com/feed/${slug}`;

// Clyx dates are wall-clock with no offset - "2026-09-23T18:30:00.000" - and
// the zone they belong to is a sibling field. The pipeline runs in
// Europe/London, so parsing one of its own dates lands on the right instant,
// but the same string for the organiser's Los Angeles night would silently
// shift by eight hours. Every event we keep has already matched a London
// venue, so a zone other than London means the record disagrees with itself:
// say so rather than publish a time that may be wrong.
const EXPECTED_TIME_ZONE = "Europe/London";

function parseEventDate(value, { slug, timeZone }) {
  if (timeZone !== EXPECTED_TIME_ZONE) {
    throw new Error(
      `Event ${slug} matched a London venue but is dated in ${timeZone} - ` +
        `its times cannot be read as ${EXPECTED_TIME_ZONE}`,
    );
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Unable to parse date "${value}" for event ${slug}`);
  }
  return date;
}

// Clyx's own tier states are on-sale, sold-out, sales-over and scheduled. Only
// sold-out means there is nothing left to buy: sales-over is a deadline that
// has passed, which says nothing about how full the room is.
const isSoldOut = (tiers = []) =>
  tiers.length > 0 && tiers.every(({ status }) => status === "sold-out");

// The organiser is named separately from the venue, and on Clyx the two are
// usually different - a film club hiring a room. That attribution is worth
// carrying, but a venue selling its own nights here would only repeat itself,
// so drop a company that is the venue under another spelling.
function getPresentedByNote(company, cinema) {
  const presenter = company?.name?.trim();
  if (!presenter) return undefined;

  const venueNames = [cinema.name, ...(cinema.alternativeNames || [])].filter(
    Boolean,
  );
  const isVenueItself = venueNames.some(
    (name) => normalizeVenueName(name) === normalizeVenueName(presenter),
  );
  if (isVenueItself) return undefined;

  return `Presented by ${presenter}`;
}

function convertClyxEvent(event, cinema) {
  const { id, slug, name, description, startDate, endDate, timeZone } = event;
  const url = eventUrl(slug);
  const overview = sanitizeRichText(description);

  const start = parseEventDate(startDate, { slug, timeZone });
  const end = endDate ? parseEventDate(endDate, { slug, timeZone }) : null;

  return {
    showingId: generateShowingId(attributes, id),
    title: name,
    url,
    overview: createOverview({
      duration: end ? differenceInMinutes(end, start) : undefined,
    }),
    performances: [
      createPerformance({
        date: start,
        url,
        status: { soldOut: isSoldOut(event.tiers) },
        accessibility: createAccessibility(name, {}, overview),
        format: createFormat(name, {}, overview),
        notesList: [getPresentedByNote(event.company, cinema)],
      }),
    ],
    // Fall back to the title when an organiser left the description empty - an
    // empty overview makes the matching LLM discard the event outright.
    matchingHints: { overview: overview || name },
  };
}

async function findEvents(cinema) {
  const dataSrc = path.join(process.cwd(), "retrieved-data", "clyx.com");

  let events = {};
  try {
    const data = await readJSON(dataSrc);
    events = data.events || {};
  } catch {
    // Source data may not always be available or required
  }

  const matchingEvents = Object.values(events).filter(({ location }) => {
    if (!location) return false;

    return venueMatchesCinema(
      cinema,
      location.locationName,
      { lat: location.latitude, lon: location.longitude },
      { eventAddress: location.address },
    );
  });

  return matchingEvents.map((event) => convertClyxEvent(event, cinema));
}

module.exports = findEvents;
