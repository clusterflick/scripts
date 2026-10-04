const path = require("node:path");
const cheerio = require("cheerio");
const { parseISO } = require("date-fns");
const {
  createPerformance,
  createOverview,
  createAccessibility,
  createFormat,
  generateShowingId,
  readJSON,
  getText,
} = require("../utils");
const { venueMatchesCinema } = require("../source-utils");

// Shared event page parsing for councils running LocalGov Drupal. Councils
// theme the page differently, but the fields come from the same content type,
// so they are found by their field names (`field--name-localgov-event-*`)
// rather than by anything a theme puts around them.
//
// The fields are read from within the event's own full-page node, as themes
// put other blocks using the same field names around it. The node can still
// nest other events ("Other events like this") after the event's own fields,
// so each field is read from its first occurrence.

// The `datetime` on each date's <time> element is the London wall-clock time
// with a "Z" wrongly appended: a screening shown as "5.00pm" in October carries
// "17:00:00Z", which is 6pm BST. That holds either side of the clocks changing
// (12.00pm on 9 October and 6 November are both "12:00:00Z"), and Southwark's
// "Add to calendar" link gives the true UTC time ("120000Z" for 1:00pm BST).
// So the "Z" is dropped and the time read as local. Anything other than that
// exact shape fails rather than being read under the wrong assumption.
function parseWallClockDatetime(datetime, url) {
  const match = datetime?.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})Z$/);
  if (!match) {
    throw new Error(
      `Unexpected event datetime "${datetime}" on ${url} — the page structure may have changed`,
    );
  }
  return parseISO(match[1]);
}

// A recurring event lists each occurrence (Haringey inside the date field,
// Southwark in a separate "All dates and times" list); a one-off event shows
// its single date in the date field. Either way, the first <time> of each is
// when it starts - the next is when it ends.
function getDates($, $event, url) {
  const $occurrences = $event
    .find("ul.date-recur-occurrences")
    .first()
    .children("li");
  const $dates = $occurrences.length
    ? $occurrences
    : $event.find(".field--name-localgov-event-date").first();

  const dates = $dates
    .toArray()
    .map((date) =>
      parseWallClockDatetime(
        $(date).find("time").first().attr("datetime"),
        url,
      ),
    );

  if (dates.length === 0) {
    throw new Error(
      `Unable to extract any dates from ${url} — the page structure may have changed`,
    );
  }

  return dates;
}

// The location is a postal address, one line per element, which postcode
// matching wants back as a single comma-separated string.
function getAddressParts($, $location) {
  const $address = $location.find("p.address").first();
  return {
    organization: getText($address.find(".organization")),
    addressLine1: getText($address.find(".address-line1")),
    address: $address
      .children("span")
      .toArray()
      .map((span) => getText($(span)))
      .filter(Boolean)
      .join(", "),
  };
}

// Where the location has been geocoded, it is drawn on a Leaflet map whose
// marker is held in the page's Drupal settings, keyed by the map element's id.
function getCoordinates($, $location, url) {
  const mapId = $location.find("[id^='leaflet-map']").first().attr("id");
  if (!mapId) return undefined;

  const settings = JSON.parse(
    $("script[data-drupal-selector='drupal-settings-json']").html() ?? "{}",
  );
  const [feature] = settings.leaflet?.[mapId]?.features ?? [];
  if (feature?.lat === undefined || feature?.lon === undefined) {
    throw new Error(
      `Unable to extract coordinates for map ${mapId} on ${url} — the page structure may have changed`,
    );
  }

  return { lat: feature.lat, lon: feature.lon };
}

// A venue the council manages is linked from a "Venue" field. Otherwise the
// event only has a location, whose address may lead with the venue's name
// (Haringey's "Kurdish Community Centre") or its first line may be the venue
// (Haringey's "The Beehive Pub") or the street address (Southwark's "21 Surrey
// Quays Road", which venue matching recognises from the cinema's address).
function getVenue($, $event, url) {
  const $location = $event.find(".field--name-localgov-event-location").first();
  const { organization, addressLine1, address } = getAddressParts($, $location);

  const venueName =
    getText(
      $event.find(".field--name-localgov-event-venue .field__item").first(),
    ) ||
    organization ||
    addressLine1;
  if (!venueName) {
    throw new Error(
      `Unable to extract a venue from ${url} — the page structure may have changed`,
    );
  }

  return {
    venueName,
    venueAddress: address,
    coordinates: getCoordinates($, $location, url),
  };
}

// Southwark leads with a one-line summary, which is often where the film's
// year and running time are given, and labels its body "Description".
function getDescription($event) {
  const summary = getText($event.find(".field--name-field-summary").first());
  const $body = $event.find(".field--name-body").first().clone();
  $body.find(".field__label").remove();
  return [summary, getText($body)].filter(Boolean).join("\n\n");
}

function parseEventPage(html, url, attributes) {
  const $ = cheerio.load(html);

  const title = getText($("main h1").first());
  if (!title) {
    throw new Error(
      `Unable to extract a film title from ${url} — the page structure may have changed`,
    );
  }

  const $event = $(".node--type-localgov-event.node--view-mode-full").first();
  if ($event.length === 0) {
    throw new Error(
      `Unable to find the event on ${url} — the page structure may have changed`,
    );
  }

  const description = getDescription($event);
  const { venueName, venueAddress, coordinates } = getVenue($, $event, url);

  return {
    venueName,
    venueAddress,
    coordinates,
    event: {
      showingId: generateShowingId(
        attributes,
        new URL(url).pathname.split("/").pop(),
      ),
      title,
      url,
      overview: createOverview({}),
      performances: getDates($, $event, url).map((date) =>
        createPerformance({
          date,
          url,
          accessibility: createAccessibility(title, {}, description),
          format: createFormat(title, {}, description),
        }),
      ),
      matchingHints: { overview: description },
    },
  };
}

async function findEvents(cinema, attributes) {
  const dataSrc = path.join(process.cwd(), "retrieved-data", attributes.id);

  let data = {};
  try {
    data = await readJSON(dataSrc);
  } catch {
    return [];
  }

  const events = [];

  for (const [url, html] of Object.entries(data.moviePages ?? {})) {
    const { venueName, venueAddress, coordinates, event } = parseEventPage(
      html,
      url,
      attributes,
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

module.exports = { findEvents };
