const path = require("node:path");
const {
  createOverview,
  createPerformance,
  createAccessibility,
  createOccasions,
  createFormat,
  generateShowingId,
  readJSON,
} = require("../../common/utils");
const { venueMatchesCinema } = require("../../common/source-utils");
const attributes = require("./attributes");
const { getEventSlug } = require("./utils");

// A venue is named as its operator and its screen, joined by a colon -
// "Genesis Entertainment Mile End Ltd: Genesis Cinema", "Romford Film Trust:
// Lumiere (Romford)" - unless the two are the same, when it is named once
// ("Prince Charles Cinema"). The screen is what we know a cinema by, so it is
// offered alongside the whole name rather than instead of it.
const getVenueNames = (name = "") => {
  const whole = name.trim();
  const screen = whole
    .split(/\s*:\s*/)
    .slice(1)
    .join(": ")
    .trim();
  return [whole, screen].filter(Boolean);
};

const getCoordinates = (geo) => {
  const lat = Number.parseFloat(geo?.latitude);
  const lon = Number.parseFloat(geo?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
};

// "PT1H49M" - the only shape seen. Anything else is thrown on rather than read
// as no runtime, since a runtime is what tells two films of a name apart.
const parseDurationMins = (duration) => {
  if (duration === undefined || duration === null) return undefined;
  const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/);
  if (!match || (!match[1] && !match[2])) {
    throw new Error(`Unreadable duration "${duration}"`);
  }
  return Number(match[1] || 0) * 60 + Number(match[2] || 0);
};

const toList = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const getNames = (people) =>
  toList(people)
    .map((person) => person?.name)
    .filter(Boolean);

const isSoldOut = (event) => {
  const offers = toList(event.offers);
  return (
    offers.length > 0 &&
    offers.every(
      ({ availability }) => availability === "https://schema.org/SoldOut",
    )
  );
};

const atCinema = (cinema) => (bookPage) => {
  const { location } = bookPage.event;
  if (!location) {
    throw new Error(
      `No location in the JSON-LD of ${bookPage.event.identifier}`,
    );
  }
  const coordinates = getCoordinates(location.geo);
  const { streetAddress, postalCode } = location.address || {};
  const eventAddress = [streetAddress, postalCode].filter(Boolean).join(", ");
  return getVenueNames(location.name).some((venueName) =>
    venueMatchesCinema(cinema, venueName, coordinates, { eventAddress }),
  );
};

function createShowing(bookPages, eventPages) {
  const [first] = bookPages;
  const slug = getEventSlug(first.event);
  const eventPage = eventPages[first.eventUrl];
  if (!eventPage) {
    throw new Error(`No event page retrieved for ${first.eventUrl}`);
  }
  const work = eventPage.work || {};

  return {
    showingId: generateShowingId(attributes, slug),
    title: first.title,
    url: first.eventUrl.replace(/\?.*$/, ""),
    overview: createOverview({
      duration: parseDurationMins(work.duration),
      directors: getNames(work.director),
      actors: getNames(work.actors),
      classification: work.contentRating?.replace(/^BBFC\s+/i, ""),
    }),
    performances: bookPages.map((bookPage) => {
      const { event, notices, title } = bookPage;
      const date = new Date(event.startDate);
      // The note about the night is the event page's for that date; the
      // notices are this booking page's own. Both are about this screening,
      // which is what accessibility and occasions read a description for.
      const note = eventPages[bookPage.eventUrl]?.note;
      const description = [note, ...notices, event.description]
        .filter(Boolean)
        .join("\n\n");

      return createPerformance({
        date,
        url: bookPage.url,
        // The programme is who put the night on - the venue only hosts it. Its
        // note is billing the title leaves out (the 1155 Soundsystem's live
        // vinyl set after the credits), so it is carried as the notes.
        notesList: [
          event.organizer?.name && `Presented by ${event.organizer.name}`,
          note,
        ],
        status: { soldOut: isSoldOut(event) },
        accessibility: createAccessibility(title, {}, description),
        format: createFormat(title, {}, description),
        occasions: createOccasions(title, {}, description, { date }),
      });
    }),
    matchingHints: {
      overview: eventPage.description || first.event.description,
    },
  };
}

async function findEvents(cinema) {
  const dataSrc = path.join(process.cwd(), "retrieved-data", attributes.id);

  let data = {};
  try {
    data = await readJSON(dataSrc);
  } catch {
    // Source data may not always be available or required
  }
  const bookPages = Object.entries(data.bookPages || {}).map(([url, page]) => ({
    url,
    ...page,
  }));
  const eventPages = data.eventPages || {};

  // A showing is a film's event in one programme, so the same film in two
  // programmes - Escapes and its Relaxed Screenings, say - stays two showings,
  // each with its own title.
  const byEvent = new Map();
  for (const bookPage of bookPages.filter(atCinema(cinema))) {
    const key = `${bookPage.programme}/${getEventSlug(bookPage.event)}`;
    if (!byEvent.has(key)) byEvent.set(key, []);
    byEvent.get(key).push(bookPage);
  }

  return [...byEvent.values()].map((pages) =>
    createShowing(
      pages.sort((a, b) => a.event.startDate.localeCompare(b.event.startDate)),
      eventPages,
    ),
  );
}

module.exports = findEvents;
