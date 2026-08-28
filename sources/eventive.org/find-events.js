const path = require("node:path");
const { parseISO } = require("date-fns");
const {
  generateShowingId,
  createOverview,
  createPerformance,
  createAccessibility,
  createFormat,
  readJSON,
} = require("../../common/utils");
const { venueMatchesCinema } = require("../../common/source-utils");
const parseDescription = require("../../common/eventive/parse-description");
const {
  getFilmMetadata,
  extractCategories,
  getTicketStatus,
} = require("../../common/eventive/get-event-details");
const attributes = require("./attributes");
const tenants = require("./tenants");

/**
 * A tenant running a festival across several screens names each one as its own
 * venue - "ODEON Luxe Leicester Square - Discovery Screen 3" - and sells its
 * seating tiers and day passes the same way, as "- Stalls" or "- Friday Day
 * Pass". The venue is whatever comes before the first such suffix.
 */
function getVenueName(venue) {
  if (!venue?.name) return null;
  return venue.name.split(" - ")[0].trim();
}

function parseEvent(event, tenant) {
  const filmMetadata = getFilmMetadata(event.films);
  const eventUrl = `${tenant.url}/schedule/${event.id}`;

  const eventDescription = parseDescription(event.description);
  // Only the blurbs. A tenant's film record sometimes carries a different name
  // to the event's billing, but neither is reliably the better one - FrightFest
  // bills HY3NA over the record's HYENA and matches on it, then bills
  // Rubberhead's subtitle wrongly and doesn't - so feeding the alternative in
  // here would put a title the listing isn't for in front of the LLM that
  // proposes titles to search. A genuine misnaming is a normalisation
  // correction, where it applies to every venue billing the film that way.
  const matchingHintsText = [filmMetadata.description, eventDescription]
    .filter((value) => !!value)
    .join("\n");

  return {
    showingId: generateShowingId(attributes, event.id),
    title: event.name,
    url: eventUrl,
    overview: createOverview({
      year: filmMetadata.year,
      duration: filmMetadata.duration,
      directors: filmMetadata.directors,
      actors: filmMetadata.actors,
      classification: filmMetadata.classification,
      // Deliberately only the tenant's visible tags. Eventive's own
      // `details.genre` is not a genre - tenants fill it with nationality
      // ("South Korean", "Japanese"), so it would poison the categories.
      categories: extractCategories(event),
    }),
    performances: [
      createPerformance({
        date: parseISO(event.start_time),
        url: eventUrl,
        // Every event on a tenant belongs to that tenant's programme, so the
        // note is the tenant rather than anything read off the event. Without
        // it a festival screening is indistinguishable from the venue's own
        // listings once it is merged in, and nothing downstream can tell that
        // a run of horror films at an Odeon was FrightFest.
        notesList: [`Part of ${tenant.name}`],
        status: getTicketStatus(event),
        accessibility: createAccessibility(event.name, {}, matchingHintsText),
        format: createFormat(event.name, {}, matchingHintsText),
      }),
    ],
    matchingHints: { overview: matchingHintsText },
  };
}

async function findEvents(cinema) {
  const dataSrc = path.join(process.cwd(), "retrieved-data", attributes.id);

  let data = {};
  try {
    data = await readJSON(dataSrc);
  } catch {
    return [];
  }

  const tenantEvents = data.tenantEvents || {};
  const events = [];

  for (const tenant of tenants) {
    for (const event of tenantEvents[tenant.id] || []) {
      // Passes and parties are sold as events alongside the screenings. They
      // carry no film, which separates them from a screening without having to
      // guess at their names.
      if (!event.films?.length) continue;

      const venueName = getVenueName(event.venue);
      if (!venueName) continue;

      if (
        !venueMatchesCinema(cinema, venueName, null, {
          eventAddress: event.venue.address,
        })
      ) {
        continue;
      }

      events.push(parseEvent(event, tenant));
    }
  }

  return events;
}

module.exports = findEvents;
