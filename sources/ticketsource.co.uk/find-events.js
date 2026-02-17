const path = require("node:path");
const { decode } = require("html-entities");
const cheerio = require("cheerio");
const {
  readJSON,
  generateShowingId,
  createAccessibility,
  basicNormalize,
  getText,
} = require("../../common/utils");
const { createOverview, createPerformance } = require("../../common/utils");
const { extractPeopleNames } = require("../../common/extract-people");
const attributes = require("./attributes");
const { venueMatchesCinema } = require("../../common/source-utils");

function getDirector(synopsis) {
  const match = synopsis.match(/^directed by\s+(.+)$/im);
  return match ? match[1].trim() : undefined;
}

function createPerformanceFromHit(
  { timestamp, venueSlug, timeHash, hint },
  title,
  eventText,
  overview,
) {
  return createPerformance({
    date: new Date(timestamp * 1000),
    url: `${attributes.domain}/${venueSlug}/${timeHash}`,
    accessibility: createAccessibility(
      title,
      {
        subtitled:
          basicNormalize(hint).includes("subtitle") ||
          basicNormalize(eventText).includes("subtitle"),
      },
      overview,
    ),
  });
}

function convertTicketSourceEvent(hits, moviePages) {
  const {
    event,
    locationSlug,
    venueSlug,
    eventSlug,
    eventHash,
    eventDescription,
    hint,
  } = hits[0]; // Use the first entry for event-level data
  const moviePage = moviePages[eventHash];
  const $ = cheerio.load(moviePage);
  const $eventText = $(".eventText");
  $eventText.find("br").replaceWith("\n");
  const eventText = getText($eventText);

  // Extract movie title from eventDescription if it's in quotes
  // e.g., 'Screening of the movie "LE GANG DES AMAZONES"' -> 'LE GANG DES AMAZONES'
  let title = event;
  const quotedTitleMatch = eventDescription?.match(/"([^"]+)"/);
  if (quotedTitleMatch) title = quotedTitleMatch[1];
  title = decode(title);

  const overview =
    eventText || `${eventDescription || ""}\n${hint || ""}`.trim() || undefined;

  return {
    showingId: generateShowingId(attributes, eventHash),
    title,
    url: `${attributes.domain}/whats-on/${locationSlug}/${venueSlug}/${eventSlug}/${eventHash}`,
    overview: createOverview({}),
    performances: hits.map((hit) =>
      createPerformanceFromHit(hit, title, eventText, overview),
    ),
    matchingHints: {
      overview,
      cast: extractPeopleNames(eventText, { stripAttributions: true }),
      crew: eventText ? [getDirector(eventText)].filter(Boolean) : undefined,
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
  let moviePages = {};
  try {
    const data = await readJSON(dataSrc);
    movieListPages = data.movieListPages || [];
    moviePages = data.moviePages || {};
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
      eventAddress: [
        hit.venueAdd1,
        hit.venueAdd2,
        hit.venueAdd3,
        hit.venueAdd4,
        hit.venuePostcode,
      ]
        .filter(Boolean)
        .join(", ")
        .trim(),
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
    convertTicketSourceEvent(hits, moviePages),
  );
}

module.exports = findEvents;
