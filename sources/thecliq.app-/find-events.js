const path = require("node:path");
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

function extractVenueFromTitle(title) {
  const match = title.match(/^.+\s+at\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function convertEvent(event, club) {
  const startDate = new Date(event.start_time);
  const endDate = new Date(event.end_time);

  // The canonical event URL — `share.thecliq.app` only redirects here, and
  // venues that hand booking over to CLIQ link to this form, so using it lets
  // those listings be recognised as the same screening.
  const eventUrl = `https://www.thecliq.app/event/${event.slug}`;

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
        notesList: [`Presented by ${club.name}`],
        // EventDetail has no boolean sold-out field; `status` is the closest
        // real signal. Observed values are "OPEN" and "SOLD_OUT" (the latter
        // matches what the club page badges as sold out / waitlist).
        status: { soldOut: event.status === "SOLD_OUT" },
        accessibility: createAccessibility(event.name, {}, event.description),
        format: createFormat(event.name, {}, event.description),
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
      // Skip CINESOCIAL meetups — attendees book the screening directly with
      // the cinema ("PLEASE BOOK YOUR TICKET DIRECTLY THROUGH THE CINEMA'S
      // WEBSITE"), so the screening itself is already covered by that cinema's
      // own listing. The CLIQ entry is just a social RSVP around it.
      if (/cinesocial/i.test(event.name)) continue;

      const location = event.location;
      // Some events don't set their location. Nothing we can do
      if (!location) continue;

      const coordinates =
        location.latitude && location.longitude
          ? { lat: location.latitude, lon: location.longitude }
          : null;

      // Split venue name before matching (e.g., "BFI Southbank, London" -> "BFI Southbank")
      const [venueName] = location.name.split(/,| - /);
      const locationMatches = venueMatchesCinema(
        cinema,
        venueName,
        coordinates,
        { eventAddress: location.address },
      );

      const titleVenue = extractVenueFromTitle(event.name);
      const titleMatches =
        titleVenue && venueMatchesCinema(cinema, titleVenue, coordinates);

      const isSocialOnly = event.description
        .toLowerCase()
        .includes("tickets are not included");
      if (isSocialOnly) continue;

      if (locationMatches || titleMatches) {
        results.push(convertEvent(event, club));
      }
    }
  }

  return results;
}

module.exports = findEvents;
