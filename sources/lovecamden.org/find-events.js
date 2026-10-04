const path = require("node:path");
const {
  createPerformance,
  createOverview,
  createAccessibility,
  createFormat,
  generateShowingId,
  readJSON,
} = require("../../common/utils");
const { venueMatchesCinema } = require("../../common/source-utils");
const attributes = require("./attributes");
const { getStories, getEventStory, isFilm } = require("./utils");

// An event's description is Storyblok rich text: a tree of nodes whose leaves
// hold the text, sitting among the page's other blocks (its booking button)
function getRichText(node) {
  if (!node || typeof node !== "object") return "";
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hard_break") return "\n";
  const text = (node.content ?? []).map(getRichText).join("");
  return node.type === "paragraph" ? `${text}\n` : text;
}

function getDescription(content) {
  return (content.content ?? [])
    .filter((block) => block?.content?.type === "doc")
    .map((block) => getRichText(block.content))
    .join("\n")
    .trim();
}

function getCoordinates({ lat, lng }) {
  const coordinates = { lat: parseFloat(lat), lon: parseFloat(lng) };
  return Number.isFinite(coordinates.lat) && Number.isFinite(coordinates.lon)
    ? coordinates
    : undefined;
}

function parseEvent(slug, story) {
  const { name, content } = story;
  const url = new URL(slug, `${attributes.domain}/`).href;

  // Listings come from Love Camden's events feed, and each carries the dates
  // it runs on. The times are UTC - a screening shown as "7pm" in October is
  // "18:00:00.000Z" - so they're used as given.
  if (!content.occurrences?.length) {
    throw new Error(
      `No occurrences for ${url} — the page structure may have changed`,
    );
  }

  const description = getDescription(content);

  return {
    venueName: content.location_name,
    venueAddress: content.location_address,
    coordinates: getCoordinates(content),
    event: {
      showingId: generateShowingId(attributes, slug.split("/").pop()),
      title: name,
      url,
      overview: createOverview({}),
      // The listing tags accessibility at event level ("Captioned",
      // "British sign language interpreted"), which doesn't say which
      // performance it applies to, so it isn't carried over
      performances: content.occurrences.map(({ start_at: startAt }) =>
        createPerformance({
          date: new Date(startAt),
          url: content.booking_url || url,
          accessibility: createAccessibility(name, {}, description),
          format: createFormat(name, {}, description),
        }),
      ),
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

  const events = [];
  for (const { full_slug: slug } of getStories(data.whatsOnData).filter(
    isFilm,
  )) {
    if (!data.eventData?.[slug]) {
      throw new Error(
        `No event data retrieved for ${slug} — re-run the retrieve`,
      );
    }
    const { venueName, venueAddress, coordinates, event } = parseEvent(
      slug,
      getEventStory(data.eventData[slug], slug),
    );
    // An event listed without a venue can't be placed
    if (!venueName) continue;

    if (
      venueMatchesCinema(cinema, venueName, coordinates, {
        eventAddress: venueAddress,
      })
    ) {
      events.push(event);
    }
  }

  return events;
}

module.exports = findEvents;
