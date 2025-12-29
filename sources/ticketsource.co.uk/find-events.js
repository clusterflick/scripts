const path = require("node:path");
const { decode } = require("html-entities");
const {
  readJSON,
  generateShowingId,
  createAccessibility,
  basicNormalize,
} = require("../../common/utils");
const { createOverview, createPerformance } = require("../../common/utils");
const attributes = require("./attributes");
const { venueMatchesCinema } = require("../../common/source-utils");

function createPerformanceFromHit(
  { timestamp, venueSlug, timeHash, hint },
  title,
) {
  return createPerformance({
    date: new Date(timestamp * 1000),
    url: `${attributes.domain}/${venueSlug}/${timeHash}`,
    accessibility: createAccessibility(title, {
      subtitled: basicNormalize(hint).includes("subtitle"),
    }),
  });
}

function convertTicketSourceEvent(hits) {
  const {
    event,
    locationSlug,
    venueSlug,
    eventSlug,
    eventHash,
    eventDescription,
    hint,
  } = hits[0]; // Use the first entry for event-level data

  // Extract movie title from eventDescription if it's in quotes
  // e.g., 'Screening of the movie "LE GANG DES AMAZONES"' -> 'LE GANG DES AMAZONES'
  let title = event;
  const quotedTitleMatch = eventDescription?.match(/"([^"]+)"/);
  if (quotedTitleMatch) title = quotedTitleMatch[1];
  title = decode(title);

  return {
    showingId: generateShowingId(attributes, eventHash),
    title,
    url: `${attributes.domain}/whats-on/${locationSlug}/${venueSlug}/${eventSlug}/${eventHash}`,
    overview: createOverview({}),
    performances: hits.map((hit) => createPerformanceFromHit(hit, title)),
    matchingHints: {
      overview: `${eventDescription || ""}\n${hint || ""}`.trim() || undefined,
    },
  };
}

/**
 * Find events matching a specific cinema
 */
async function findEvents(cinema) {
  const dataSrc = path.join(
    process.cwd(),
    "retrieved-data",
    "ticketsource.co.uk",
  );

  let movieListPages = [];
  try {
    const data = await readJSON(dataSrc);
    movieListPages = data.movieListPages || [];
  } catch {
    // Source data may not always be available or required
  }

  const allHits = movieListPages
    .flatMap(({ hits }) => hits)
    // Remove duplicates; as we're running more than one search, it's possible
    // to get the same values back for both.
    .reduce((acc, hit) => {
      const missingValue = !acc.find((item) => item.objectID === hit.objectID);
      if (missingValue) acc.push(hit);
      return acc;
    }, []);
  const matchingEvents = allHits.filter((hit) => {
    const coordinates = { lat: hit._geoloc.lat, lon: hit._geoloc.lng };
    return venueMatchesCinema(cinema, hit.venue, coordinates, {
      supportMisconfiguredCoordinates: true,
    });
  });

  // Group by eventID
  const groupedByEventId = matchingEvents.reduce((acc, hit) => {
    if (!acc[hit.eventID]) acc[hit.eventID] = [];
    acc[hit.eventID].push(hit);
    return acc;
  }, {});

  // Convert each group into a single event with multiple performances
  return Object.values(groupedByEventId).map((hits) =>
    convertTicketSourceEvent(hits),
  );
}

module.exports = findEvents;
