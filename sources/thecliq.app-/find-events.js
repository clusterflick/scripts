const path = require("node:path");
const {
  readJSON,
  generateShowingId,
  createOverview,
  createPerformance,
  createAccessibility,
} = require("../../common/utils");
const { venueMatchesCinema } = require("../../common/source-utils");
const attributes = require("./attributes");

function extractVenueFromTitle(title) {
  const match = title.match(/^.+\s+at\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function convertEvent(event, club) {
  const startDate = new Date(event.start_time);
  const endDate = new Date(event.end_time);

  const eventUrl = `https://share.thecliq.app/event/${event.slug}`;

  return {
    showingId: generateShowingId(attributes, event.event_id),
    title: event.name,
    url: eventUrl,
    overview: createOverview({
      duration: (endDate.getTime() - startDate.getTime()) / 1000 / 60,
    }),
    performances: [
      createPerformance({
        date: startDate,
        url: eventUrl,
        notes: `Presented by ${club.name}`,
        status: { soldOut: event.is_sold_out },
        accessibility: createAccessibility(event.name, {}, event.description),
      }),
    ],
    matchingHints: { overview: event.description },
  };
}

async function findEvents(cinema) {
  const dataSrc = path.join(process.cwd(), "retrieved-data", "thecliq.app-");

  let clubs = {};
  try {
    const data = await readJSON(dataSrc);
    clubs = data.clubs || {};
  } catch {
    return [];
  }

  const now = new Date();
  const results = [];

  for (const club of Object.values(clubs)) {
    const events = club.events || [];

    for (const event of events) {
      // Skip past events
      if (new Date(event.end_time) < now) continue;
      // Skip discussion only events
      if (/film discussion/i.test(event.name)) continue;

      const location = event.location;
      // Some events don't set their location. Nothing we can do
      if (!location) continue;

      const coordinates =
        location.latitude && location.longitude
          ? { lat: location.latitude, lon: location.longitude }
          : null;

      const locationMatches = venueMatchesCinema(
        cinema,
        location.name,
        coordinates,
        { eventAddress: location.address },
      );

      const titleVenue = extractVenueFromTitle(event.name);
      const titleMatches =
        titleVenue && venueMatchesCinema(cinema, titleVenue, coordinates);

      if (locationMatches || titleMatches) {
        results.push(convertEvent(event, club));
      }
    }
  }

  return results;
}

module.exports = findEvents;
