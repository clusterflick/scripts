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
const normalizeVenueName = require("../../common/normalize-venue-name");
const attributes = require("./attributes");
const { getDescriptionText } = require("./utils");

// Luma events are hosted rather than programmed - anyone can put one on
// anywhere - so the host is who is running the night, which for a screening is
// the film club behind it: Korean Film Club, CineSavour, the Anti-Brainrot
// Club. A venue running its own night repeats its own name there, which tells
// a reader nothing, so only a host that isn't the venue is kept - the same rule
// DICE and OutSavvy apply to the promoter field they get handed.
//
// "Personal" is Luma's own label for an event posted from a personal calendar
// rather than a named one. It is a default, not a credit.
const getHostedByNote = (event, cinema) => {
  const host = (event.hosts ?? [])
    .map(({ name }) => (name || "").trim())
    .find(Boolean);
  if (!host || host.toLowerCase() === "personal") return undefined;

  const venueNames = [cinema.name, ...(cinema.alternativeNames || [])].filter(
    Boolean,
  );
  const isVenueItself = venueNames.some(
    (name) => normalizeVenueName(name) === normalizeVenueName(host),
  );

  return isVenueItself ? undefined : `Hosted by ${host}`;
};

function convertLumaEvent(event, cinema) {
  const details = event.event;
  // Luma's public address for an event is its slug on the short domain - the
  // api_id never appears in a link a reader can follow.
  const url = `https://lu.ma/${details.url}`;
  const overview = getDescriptionText(event.description_mirror);

  const startDate = new Date(details.start_at);
  const endDate = new Date(details.end_at);

  return {
    showingId: generateShowingId(attributes, details.api_id),
    title: details.name,
    url,
    overview: createOverview({
      duration: (endDate.getTime() - startDate.getTime()) / 1000 / 60,
    }),
    performances: [
      createPerformance({
        date: startDate,
        notesList: [getHostedByNote(event, cinema)],
        url,
        status: { soldOut: !!event.ticket_info?.is_sold_out },
        accessibility: createAccessibility(details.name, {}, overview),
        format: createFormat(details.name, {}, overview),
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
    const details = event.event;
    // An online-only event has no venue to sit at, and Luma marks it as such
    // rather than leaving the address empty.
    if (!details || details.location_type !== "offline") return false;

    // An event whose address is only a city carries `geo_address_info` with no
    // `address` - "London, UK" and nothing else. There is no venue name to
    // compare, so it cannot be placed at a cinema and is dropped rather than
    // matched on the postcode alone, which would put it at whichever venue
    // shares its outward code.
    const address = details.geo_address_info;
    if (!address?.address) return false;

    // Luma writes coordinates as latitude/longitude; the repo compares lat/lon,
    // and a mismatched pair reads as undefined rather than throwing - which
    // silently demotes every match to the postcode fallback.
    const coordinates = details.coordinate
      ? { lat: details.coordinate.latitude, lon: details.coordinate.longitude }
      : null;

    return venueMatchesCinema(cinema, address.address, coordinates, {
      eventAddress: address.full_address,
    });
  });

  return filteredEvents.map((event) => convertLumaEvent(event, cinema));
}

module.exports = findEvents;
