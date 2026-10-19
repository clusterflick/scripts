const path = require("node:path");
const { decode } = require("html-entities");
const {
  createPerformance,
  createOverview,
  createAccessibility,
  createFormat,
  generateShowingId,
  readJSON,
  sanitizeRichText,
} = require("../../common/utils");
const { venueMatchesCinema } = require("../../common/source-utils");
const { extractJsonLdEvents } = require("../../common/tribe-events/transform");
const attributes = require("./attributes");

// A screening is listed before its film is chosen, billed as "Feminist
// Fightback Filmclub presents: TBC", and renamed once it is. Until then there
// is no film to list.
const isUnannounced = (title) => /:\s*TBC\s*$/i.test(title);

function extractEventSlug(url) {
  return url.split("/event/")[1].replace(/\/$/, "");
}

function parseEvent(event) {
  const title = decode(event.name);

  const { location } = event;
  if (!location?.name) {
    throw new Error(
      `Unable to extract a venue for ${event.url} — the page structure may have changed`,
    );
  }
  const venueName = decode(location.name);
  const venueAddress = [
    location.address?.streetAddress,
    location.address?.addressLocality,
    location.address?.postalCode,
  ]
    .filter(Boolean)
    .join(", ");

  // Descriptions are double-encoded HTML, so sanitise twice. The listing
  // carries an excerpt rather than the whole text, but the excerpt opens by
  // naming the film and its director, which is what matching needs.
  const description = sanitizeRichText(
    sanitizeRichText(event.description || ""),
  );

  return {
    venueName,
    venueAddress,
    event: {
      showingId: generateShowingId(attributes, extractEventSlug(event.url)),
      title,
      url: event.url,
      // The listing runs from doors to the end of the discussion, so its length
      // is not the film's and is left off.
      overview: createOverview({}),
      performances: [
        createPerformance({
          date: new Date(event.startDate),
          url: event.url,
          accessibility: createAccessibility(title, {}, description),
          format: createFormat(title, {}, description),
        }),
      ],
      matchingHints: { overview: description },
    },
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

  // A screening can recur across pages, so dedupe by URL.
  const eventsMap = new Map();

  for (const html of data.movieListPages ?? []) {
    for (const event of extractJsonLdEvents(html)) {
      if (event.eventStatus === "https://schema.org/EventCancelled") continue;
      if (eventsMap.has(event.url)) continue;
      if (isUnannounced(decode(event.name))) continue;

      const { venueName, venueAddress, event: parsed } = parseEvent(event);
      if (
        venueMatchesCinema(cinema, venueName, undefined, {
          eventAddress: venueAddress,
        })
      ) {
        eventsMap.set(event.url, parsed);
      }
    }
  }

  return Array.from(eventsMap.values());
}

module.exports = findEvents;
