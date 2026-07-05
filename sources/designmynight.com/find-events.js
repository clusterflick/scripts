const path = require("node:path");
const { parse, differenceInMinutes } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const slugify = require("slugify");
const {
  readJSON,
  createOverview,
  createPerformance,
  generateShowingId,
  basicNormalize,
  createAccessibility,
} = require("../../common/utils");
const { venueMatchesCinema } = require("../../common/source-utils");
const attributes = require("./attributes");

function parseDateTime(date, time) {
  return parse(`${date} ${time}`, "yyyy-MM-dd HH:mm", new Date(), {
    locale: enGB,
  });
}

/**
 * Extract movie titles from ticket types by removing date/day patterns
 * e.g., "Saturday 1st November- The Addam's Family" -> "The Addam's Family"
 * Returns null if no date pattern was found (indicating it's a generic ticket name)
 */
function extractMovieTitleFromTicketName(ticketName) {
  if (!ticketName) return null;

  const originalName = ticketName;

  let title = ticketName
    // Remove common date patterns at the start:
    // - "Saturday 1st November- "
    // - "Sunday 2nd November: "
    .replace(
      /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+.*?[-:]\s*/i,
      "",
    )
    // Remove common date patterns at the end:
    // - "(30th October)"
    // - "(2nd Nov)"
    .replace(
      /\s*\(\d+\w*\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\)\s*$/i,
      "",
    )
    .trim();

  // If the title is unchanged, and it includes a keyword that looks like a
  // ticket name then let's assume it's not a movie title
  const normalizeTitle = basicNormalize(title);
  if (
    title === originalName &&
    (normalizeTitle.includes("admission") ||
      normalizeTitle.includes("cinema") ||
      normalizeTitle.includes("seating") ||
      normalizeTitle.includes("ticket") ||
      normalizeTitle.includes("2 for £") || // E.g. 2 for £20
      normalizeTitle.includes("royal box") ||
      normalizeTitle.includes("table for") ||
      normalizeTitle.includes("advance adult") ||
      normalizeTitle.includes("advance child") ||
      normalizeTitle === "advance" ||
      normalizeTitle === "patreon" ||
      normalizeTitle.match(/^entry\b/i)) // e.g. "Entry" or "Entry with Pizza"
  ) {
    return undefined;
  }

  return title;
}

/**
 * Check if occurrences contain multiple different movies based on ticket names
 */
function extractMovieGroupsFromOccurrences(occurrences) {
  const movieGroups = new Map();

  for (const occurrence of occurrences) {
    if (occurrence.cancelled) continue;

    // Get all unique movie titles from this occurrence's ticket types
    const ticketMovieTitles = new Set();
    if (occurrence.ticket_types && occurrence.ticket_types.length > 0) {
      for (const ticketType of occurrence.ticket_types) {
        const extractedTitle = extractMovieTitleFromTicketName(ticketType.name);
        if (extractedTitle) {
          ticketMovieTitles.add(extractedTitle);
        }
      }
    }

    // If we found movie titles in tickets, group this occurrence by those titles
    if (ticketMovieTitles.size > 0) {
      for (const movieTitle of ticketMovieTitles) {
        if (!movieGroups.has(movieTitle)) {
          movieGroups.set(movieTitle, []);
        }
        movieGroups.get(movieTitle).push(occurrence);
      }
    } else {
      // No movie title found in tickets, use null key (will use event title)
      if (!movieGroups.has(null)) {
        movieGroups.set(null, []);
      }
      movieGroups.get(null).push(occurrence);
    }
  }

  return movieGroups;
}

function convertDesignMyNightEvent(
  eventId,
  eventData,
  listingData,
  movieTitle,
  occurrences,
) {
  const { event } = eventData;

  // Use provided movie title or fall back to event title
  const title = movieTitle || event.title;

  // Get the full URL from the listing data or construct it
  const listingUrl =
    listingData?.path || `${attributes.domain}${event.event_url}`;
  const eventUrl = `${listingUrl}#:~:text=${encodeURIComponent(title)}`;

  // Calculate duration for each occurrence to check if they're consistent
  const durations = occurrences
    .filter(
      ({ cancelled, ticket_types: ticketTypes }) =>
        !cancelled && ticketTypes.length > 0,
    )
    .map((occurrence) => {
      const startTime = occurrence.ticket_types[0].start_time;
      const endTime = occurrence.ticket_types[0].end_time;
      const startDateTime = parseDateTime(occurrence.date, startTime);
      const endDateTime = parseDateTime(occurrence.end_date, endTime);
      return differenceInMinutes(endDateTime, startDateTime);
    });

  // Only include duration if all occurrences have the same duration
  const uniqueDurations = [...new Set(durations)];
  const durationMinutes =
    uniqueDurations.length === 1 && uniqueDurations[0] > 0
      ? uniqueDurations[0]
      : undefined;

  const performances = occurrences
    .filter(
      ({ cancelled, ticket_types: ticketTypes }) =>
        !cancelled && ticketTypes.length > 0,
    )
    .map((occurrence) => {
      const {
        date: startDate,
        is_sold_out: soldOut,
        ticket_types,
      } = occurrence;

      const startTime = ticket_types[0].start_time;
      const date = parseDateTime(startDate, startTime);
      return createPerformance({
        date,
        url: eventUrl,
        status: { soldOut },
        accessibility: createAccessibility(title, {}, listingData?.excerpt),
      });
    });

  // Generate a unique showing ID - if we have a movie title, include it in the hash
  const showingIdSuffix = movieTitle
    ? `-${slugify(basicNormalize(movieTitle), { strict: true })}`
    : "";
  const showingId = generateShowingId(
    attributes,
    `${eventId}${showingIdSuffix}`,
  );

  return {
    showingId,
    title,
    url: eventUrl,
    overview: createOverview({
      duration: durationMinutes,
    }),
    performances,
    matchingHints: { overview: listingData?.excerpt },
  };
}

async function findEvents(cinema) {
  const dataSrc = path.join(
    process.cwd(),
    "retrieved-data",
    "designmynight.com",
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

  const uniqueListings = Object.values(
    movieListPages.reduce((acc, listing) => {
      acc[listing.designmynight_id] = listing;
      return acc;
    }, {}),
  );

  // Filter movieListPages to find events at this cinema
  const matchingListings = uniqueListings.filter(({ location, venue }) => {
    const coordinates = location
      ? { lat: location.lat, lon: location.lon }
      : null;
    return venueMatchesCinema(cinema, venue.title, coordinates);
  });

  // For each matching listing, get the event data from moviePages
  const events = [];
  for (const listing of matchingListings) {
    const eventId = listing.designmynight_id;
    const eventData = moviePages[eventId];

    if (eventData?.occurrences?.length > 0) {
      // Split event into separate movies if it contains multiple
      const movieGroups = extractMovieGroupsFromOccurrences(
        eventData.occurrences,
      );

      for (const [movieTitle, occurrences] of movieGroups.entries()) {
        const event = convertDesignMyNightEvent(
          eventId,
          eventData,
          listing,
          movieTitle,
          occurrences,
        );
        if (event.performances.length > 0) {
          events.push(event);
        }
      }
    }
  }

  return events;
}

module.exports = findEvents;
