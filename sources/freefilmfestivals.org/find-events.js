const path = require("node:path");
const cheerio = require("cheerio");
const {
  createPerformance,
  createOverview,
  createAccessibility,
  createFormat,
  generateShowingId,
  readJSON,
  getText,
  basicNormalize,
} = require("../../common/utils");
const { venueMatchesCinema } = require("../../common/source-utils");
const attributes = require("./attributes");

// Event pages are rendered by The Events Calendar, which publishes each
// screening as a schema.org Event. That gives an unambiguous start time and,
// where the venue has been geocoded, its coordinates — both of which the
// human-readable page only carries in looser forms ("Friday 04th September
// 2026" plus a separate "8:00PM").
function getEventData($, url) {
  for (const script of $('script[type="application/ld+json"]').toArray()) {
    let parsed;
    try {
      parsed = JSON.parse($(script).html());
    } catch {
      continue;
    }

    const entries = Array.isArray(parsed) ? parsed : [parsed];
    const event = entries.find((entry) => entry?.["@type"] === "Event");
    if (event) return event;
  }

  throw new Error(
    `Unable to find schema.org event data on ${url} — the page structure may have changed`,
  );
}

// Running times are hand-entered and come in a mix of shapes: "120 mins",
// "106", "2hr", "1hr 49mins" and "2hr 7 mins".
function parseDuration(text) {
  if (!text) return undefined;
  // Double bills list both films ("84 mins / 87 mins"); there is no single
  // running time to report, so leave it off rather than pick one.
  if (text.includes("/")) return undefined;

  const hoursMatch = text.match(/(\d+)\s*hr/i);
  const remainder = hoursMatch
    ? text.slice(hoursMatch.index + hoursMatch[0].length)
    : text;
  const minutesMatch = remainder.match(/\d+/);

  const duration =
    (hoursMatch ? parseInt(hoursMatch[1], 10) * 60 : 0) +
    (minutesMatch ? parseInt(minutesMatch[0], 10) : 0);

  return duration || undefined;
}

// As with the running time, a double bill lists both films' years
// ("1970 / 1972") and neither one describes the event on its own.
function parseYear(text) {
  const match = text?.match(/^\s*(\d{4})\s*$/);
  return match ? match[1] : undefined;
}

// The "Other" meta group is a definition list of hand-entered film details:
// Director, Certificate, Running Time, Year and Country.
function getMeta($) {
  const meta = {};
  $(".tribe-events-meta-group-other dl dt").each((i, term) => {
    const $term = $(term);
    meta[getText($term).toLowerCase()] = getText($term.next("dd"));
  });
  return meta;
}

function getDescription($) {
  return getText($(".tribe-events-single-event-description"))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

// Festivals are named after the neighbourhood that runs them ("Streatham",
// "Peckham & Nunhead"). The catch-all bucket for one-off screenings is named
// "Other Screenings" rather than a place, so it doesn't take the suffix.
function getFestivalNote(festival) {
  return basicNormalize(festival).endsWith("screenings")
    ? `Part of Free Film Festivals' ${festival}`
    : `Part of the ${festival} Free Film Festival`;
}

function parseEvent(html, url, festival) {
  const $ = cheerio.load(html);

  const title = getText($("h1.tribe-events-single-event-title"));
  if (!title) {
    throw new Error(
      `Unable to extract a film title from ${url} — the page structure may have changed`,
    );
  }

  const eventData = getEventData($, url);
  if (!eventData.startDate) {
    throw new Error(
      `Unable to extract a start date from ${url} — the page structure may have changed`,
    );
  }

  const $venue = $(".tribe-events-meta-group-venue");
  const venueName = getText($venue.find(".tribe-venue"));
  if (!venueName) {
    throw new Error(
      `Unable to extract a venue name from ${url} — the page structure may have changed`,
    );
  }

  // Venue addresses run across several elements, one per line; collapse them
  // back into the single comma-separated string postcode matching expects.
  const venueAddress = getText($venue.find("address.tribe-events-address"))
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .trim();

  // Only some venues have been geocoded; the rest fall back to matching on the
  // address's postcode.
  const { geo } = eventData.location ?? {};
  const coordinates = geo
    ? { lat: geo.latitude, lon: geo.longitude }
    : undefined;

  const meta = getMeta($);
  const description = getDescription($);

  return {
    venueName,
    venueAddress,
    coordinates,
    event: {
      showingId: generateShowingId(
        attributes,
        url.replace(/\/$/, "").split("/").pop(),
      ),
      title,
      url,
      overview: createOverview({
        duration: parseDuration(meta["running time"]),
        year: parseYear(meta.year),
        directors: meta.director,
        classification: meta.certificate,
      }),
      performances: [
        createPerformance({
          date: new Date(eventData.startDate),
          url,
          notesList: [getFestivalNote(festival)],
          accessibility: createAccessibility(title, {}, description),
          format: createFormat(title, {}, description),
        }),
      ],
      matchingHints: { overview: description },
    },
  };
}

async function findEvents(cinema) {
  const dataSrc = path.join(
    process.cwd(),
    "retrieved-data",
    "freefilmfestivals.org",
  );

  let data = {};
  try {
    data = await readJSON(dataSrc);
  } catch {
    return [];
  }

  const events = [];

  for (const [url, moviePage] of Object.entries(data.moviePages ?? {})) {
    const { venueName, venueAddress, coordinates, event } = parseEvent(
      moviePage.html,
      url,
      moviePage.festival,
    );

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
