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
const { isNotNonFilmEvent } = require("../../common/is-non-film-event");
const normalizeVenueName = require("../../common/normalize-venue-name");
const attributes = require("./attributes");
const { parseLocalTime, getVenueNameParts } = require("./utils");

// Billetto calls the organiser the event's `brand`, and for a screening it is
// the film club running the night rather than the venue - Twickenham Cinema
// Club at The Cabbage Patch. A venue selling its own night repeats its own name
// there, which tells a reader nothing, so only an organiser that isn't the
// venue is kept, as Luma, DICE and OutSavvy do with theirs.
const getHostedByNote = (event, cinema) => {
  const host = (event.brand || "").trim();
  if (!host) return undefined;

  const venueNames = [cinema.name, ...(cinema.alternativeNames || [])].filter(
    Boolean,
  );
  const isVenueItself = venueNames.some(
    (name) => normalizeVenueName(name) === normalizeVenueName(host),
  );

  return isVenueItself ? undefined : `Hosted by ${host}`;
};

function convertBillettoEvent(event, cinema) {
  const startDate = parseLocalTime(event, "starts_at");
  const overview = event.description || "";

  // An end time the organiser has hidden isn't one they are publishing, so it
  // isn't read as how long the screening runs.
  const duration = event.hide_end_date
    ? undefined
    : (parseLocalTime(event, "ends_at").getTime() - startDate.getTime()) /
      1000 /
      60;

  return {
    showingId: generateShowingId(attributes, event.objectID),
    title: event.name,
    url: event.url,
    overview: createOverview({ duration }),
    performances: [
      createPerformance({
        date: startDate,
        notesList: [getHostedByNote(event, cinema)],
        url: event.url,
        status: { soldOut: event.event_availability === "sold_out" },
        accessibility: createAccessibility(event.name, {}, overview),
        format: createFormat(event.name, {}, overview),
        occasions: createOccasions(event.name, {}, overview, {
          date: startDate,
        }),
      }),
    ],
    matchingHints: { overview },
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

  const filteredEvents = events.filter((event) => {
    // Matched on name and place, so an event without either - an online
    // screening - can't be at a venue we hold.
    if (!event.venue_name || !event._geoloc) return false;

    // The postcode isn't passed: Billetto's is free text, and The Cabbage
    // Patch's reads "TW2 5AB 3SZ", whose first postcode is ~0.9km away. The
    // coordinates are its own geocoding and are what is compared instead.
    //
    // An organiser can name the room before the place - "Richard Hoggart
    // Building, Goldsmiths" - so each comma-separated part is tried, as Ticket
    // Tailor's find-events does. Each still has to agree on coordinates, so
    // trying more parts can only add a match at the right place.
    const coordinates = { lat: event._geoloc.lat, lon: event._geoloc.lng };
    return getVenueNameParts(event.venue_name).some((venueName) =>
      venueMatchesCinema(cinema, venueName, coordinates),
    );
  });

  // An organiser picks the type and subcategory themselves, so nothing makes a
  // "screening" a film - the retrieve reads every one. Drop the ones we know
  // aren't films here: a venue with its own transform concatenates what a
  // source hands it without consulting the list.
  return filteredEvents
    .map((event) => convertBillettoEvent(event, cinema))
    .filter(isNotNonFilmEvent);
}

module.exports = findEvents;
