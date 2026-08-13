const path = require("node:path");
const {
  createOverview,
  createPerformance,
  readJSON,
  generateShowingId,
  createAccessibility,
  createFormat,
} = require("../../common/utils");
const attributes = require("./attributes");
const { venueMatchesCinema } = require("../../common/source-utils");
const normalizeVenueName = require("../../common/normalize-venue-name");

// DICE labels events with the promoter behind them — "Presented by Midweek
// Cinema." — which for a screening names the film club programming it. Venues
// promoting their own nights repeat their own name there, which tells a reader
// nothing, so only keep a presenter that isn't the venue itself.
const getPresentedByNote = (event, cinema) => {
  const presenter = (event.presented_by || "")
    .replace(/^\s*presented by\s+/i, "")
    .replace(/\.\s*$/, "")
    .trim();
  if (!presenter) return undefined;

  const venueNames = [
    event.venues?.[0]?.name,
    cinema.name,
    ...(cinema.alternativeNames || []),
  ].filter(Boolean);
  const isVenueItself = venueNames.some(
    (name) => normalizeVenueName(name) === normalizeVenueName(presenter),
  );
  if (isVenueItself) return undefined;

  return `Presented by ${presenter}`;
};

function convertDiceEvent(event, cinema) {
  const url = `https://dice.fm/event/${event.perm_name}`;
  const eventId = event.perm_name.match(/^([^-]+)/)?.[1];

  const startDate = new Date(event.dates.event_start_date);
  const endDate = new Date(event.dates.event_end_date);
  const overview = event.about?.description;

  return {
    showingId: generateShowingId(attributes, eventId),
    title: event.name,
    url,
    overview: createOverview({
      duration: (endDate.getTime() - startDate.getTime()) / 1000 / 60,
    }),
    performances: [
      createPerformance({
        date: startDate,
        notesList: [getPresentedByNote(event, cinema)],
        url,
        accessibility: createAccessibility(event.name, {}, overview),
        format: createFormat(event.name, {}, overview),
      }),
    ],
    matchingHints: { overview },
  };
}

async function findEvents(cinema) {
  const dataSrc = path.join(process.cwd(), "retrieved-data", "dice.fm");

  let events = [];
  try {
    const data = await readJSON(dataSrc);
    events = data.events || [];
  } catch {
    // Source data may not always be available or required
  }

  const filteredEvents = events.filter((event) => {
    const venue = event.venues?.[0];
    if (!venue) return false;

    const coordinates = {
      lat: venue.location.lat,
      lon: venue.location.lng,
    };
    return venueMatchesCinema(cinema, venue.name, coordinates, {
      eventAddress: venue.address,
    });
  });

  const uniqueEvents = filteredEvents.filter(
    (event, index, self) =>
      self.findIndex((e) => e.perm_name === event.perm_name) === index,
  );

  return uniqueEvents.map((event) => convertDiceEvent(event, cinema));
}

module.exports = findEvents;
