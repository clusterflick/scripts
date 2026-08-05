const path = require("node:path");
const {
  readJSON,
  basicNormalize,
  sanitizeRichText,
  generateShowingId,
  createAccessibility,
  createFormat,
  convertNamesTextToList,
} = require("../../common/utils");
const { createOverview, createPerformance } = require("../../common/utils");
const { parseDate } = require("./utils");
const attributes = require("./attributes");
const { venueMatchesCinema } = require("../../common/source-utils");
const { isNotNonFilmEvent } = require("../../common/is-non-film-event");

function getEventDescription(details) {
  if (!details) return "";

  const context =
    details.components?.eventDescription || details.props?.pageProps?.context;

  // Bail if we can't traverse down to get the right context data
  if (!context || context === details) return "";

  return (
    context.structuredContent?.modules
      .filter(({ type }) => basicNormalize(type) === "text")
      .map(({ text }) => sanitizeRichText(text))
      .join("\n\n")
      .replace(/\n\n+/gi, "\n\n") || ""
  );
}

function isExcludedEvent({ name, tags }) {
  // Exclude events which are medical screenings
  if (
    tags.some(
      (tag) =>
        basicNormalize(tag.display_name).includes("medical") ||
        basicNormalize(tag.display_name).includes("healthcare"),
    )
  ) {
    return true;
  }

  return (
    // Exclude film clubs which only discuss the movie but don't have a showing
    basicNormalize(name).startsWith(
      basicNormalize("All Out of Bubblegum Film Club"),
    ) ||
    // Exclude Gaming events
    basicNormalize(name).includes(basicNormalize("Global Game Jam")) ||
    // Exclude online workshops
    basicNormalize(name).includes("online workshop")
  );
}

function convertEventbriteEvent(event, details) {
  const startDate = parseDate(`${event.start_date}T${event.start_time}`);
  const endDate = parseDate(`${event.end_date}T${event.end_time}`);
  const duration = (endDate.getTime() - startDate.getTime()) / 1000 / 60;
  const eventDescription = getEventDescription(details);

  const crewMatch = eventDescription.match(/Dir:(.*)\n/i);
  const castMatch = eventDescription.match(/Cast:(.*)\n/i);
  const overview =
    `Duration: ${duration}\n\n${event.summary}\n\n${eventDescription}`.trim();

  return {
    showingId: generateShowingId(attributes, event.id),
    title: event.name,
    url: event.url,
    overview: createOverview({ duration }),
    performances: [
      createPerformance({
        date: startDate,
        notesList: [],
        url: event.tickets_url,
        accessibility: createAccessibility(event.name, {}, overview),
        format: createFormat(event.name, {}, overview),
      }),
    ],
    matchingHints: {
      overview,
      crew: crewMatch ? convertNamesTextToList(crewMatch[1]) : undefined,
      cast: castMatch ? convertNamesTextToList(castMatch[1]) : undefined,
    },
  };
}

function uniqueEvents(events) {
  const ids = {};
  return events.filter((event) => {
    const isNewEvent = !ids[event.id];
    ids[event.id] = true;
    return isNewEvent;
  });
}

async function findEvents(cinema) {
  const dataSrc = path.join(
    process.cwd(),
    "retrieved-data",
    "eventbrite.co.uk",
  );
  let movieListPages = [];
  let moviePages = {};
  try {
    const data = await readJSON(dataSrc);
    movieListPages = data.movieListPages;
    moviePages = data.moviePages;
  } catch {
    // Source data may not always be available or required
  }

  const events = uniqueEvents(
    movieListPages.flatMap(({ search_data: { events } }) => events.results),
  );

  const filteredEvents = events.filter((event) => {
    if (event.is_cancelled || event.is_online_event) return false;
    if (isExcludedEvent(event)) return false;
    if (!event.primary_venue) return false;

    const {
      primary_venue: {
        name,
        address: {
          longitude: lon,
          latitude: lat,
          localized_address_display: eventAddress,
        },
      },
    } = event;
    // Split venue name before matching (e.g., "BFI Southbank, London" -> "BFI Southbank")
    const [venueName] = name.split(/,| - /);
    // localized_address_display is like "265 Lavender Hill, London, SW11 1JB"
    return venueMatchesCinema(
      cinema,
      venueName,
      { lat, lon },
      { eventAddress },
    );
  });

  return filteredEvents
    .map((event) => convertEventbriteEvent(event, moviePages[event.url]))
    .filter(isNotNonFilmEvent);
}

module.exports = findEvents;
