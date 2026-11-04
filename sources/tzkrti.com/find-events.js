const path = require("node:path");
const {
  createOverview,
  createPerformance,
  createAccessibility,
  createFormat,
  generateShowingId,
  readJSON,
} = require("../../common/utils");
const { venueMatchesCinema } = require("../../common/source-utils");
const { isNotNonFilmEvent } = require("../../common/is-non-film-event");
const attributes = require("./attributes");
const {
  getEventUrl,
  getHtmlText,
  getStartDate,
  getDurationInMinutes,
} = require("./utils");

// The listing's own vocabulary for whether tickets can be bought. Only these
// have been seen; another fails rather than being read as on sale.
const SALE_STATUSES = {
  "On Sale": { soldOut: false },
  "Coming Soon": { soldOut: false },
  "Sold Out": { soldOut: true },
};

const getStatus = (event) => {
  const status = SALE_STATUSES[event.sale_status];
  if (!status) {
    throw new Error(
      `tzkrti event ${event.id} has an unknown sale_status "${event.sale_status}"`,
    );
  }
  return status;
};

function convertTzkrtiEvent(event) {
  const title = event.name?.en;
  if (!title) {
    throw new Error(`tzkrti event ${event.id} has no English name`);
  }

  const url = getEventUrl(event);
  // The agenda is where a night with more than one thing on says which films
  // it screens - Asafeer's names "Maradona's Leg" and "An Orange from Jaffa",
  // which its description does not.
  const overview = [
    getHtmlText(event.content?.en),
    getHtmlText(event.extra_detail?.agenda?.en),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    showingId: generateShowingId(attributes, event.id),
    title,
    url,
    overview: createOverview({ duration: getDurationInMinutes(event) }),
    performances: [
      createPerformance({
        date: getStartDate(event),
        url,
        status: getStatus(event),
        accessibility: createAccessibility(title, {}, overview),
        format: createFormat(title, {}, overview),
      }),
    ],
    matchingHints: { overview },
  };
}

async function findEvents(cinema) {
  const dataSrc = path.join(process.cwd(), "retrieved-data", attributes.id);

  let events = [];
  try {
    const data = await readJSON(dataSrc);
    events = Object.values(data.events || {});
  } catch {
    // Source data may not always be available or required
  }

  const filteredEvents = events.filter((event) => {
    const place = event.place_obj;
    if (!place?.name?.en) return false;

    const lat = Number.parseFloat(place.latitude);
    const lon = Number.parseFloat(place.longitude);
    const coordinates =
      Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;

    return venueMatchesCinema(cinema, place.name.en, coordinates, {
      eventAddress: place.address,
    });
  });

  // Tzkrti has no category screenings reliably sit under, so the whole city is
  // read - and most of it is concerts. Drop what we know isn't a film here
  // rather than downstream: a venue with its own transform concatenates what a
  // source hands it without consulting the list.
  return filteredEvents.map(convertTzkrtiEvent).filter(isNotNonFilmEvent);
}

module.exports = findEvents;
