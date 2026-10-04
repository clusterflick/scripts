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
//
// An event with no dates left to show renders its date field empty: Kingston
// still lists its June film festival, whose page has an empty date field and
// no address. That gives no dates rather than an error, so it's skipped. A
// date that is there but can't be read still fails.
function getDates($, $event, url) {
  const $occurrences = $event
    .find("ul.date-recur-occurrences")
    .first()
    .children("li");
  const $dates = $occurrences.length
    ? $occurrences
    : $event.find(".field--name-localgov-event-date").first();

  return $dates
    .toArray()
    .map((date) => $(date).find("time").first())
    .filter(($time) => $time.length > 0)
    .map(($time) => parseWallClockDatetime($time.attr("datetime"), url));
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
// (Haringey's "The Beehive Pub", Kingston's "The cornerHOUSE") or the street
// address (Southwark's "21 Surrey Quays Road", which venue matching recognises
// from the cinema's address). Kingston holds the address in a field of its
// own rather than the content type's location.
//
// Kingston's events are submitted by the public, and some arrive with no
// address at all ("United Kingdom" alone, or no address field). There's no
// venue to match such an event against, so it gives null.
function getVenue($, $event, url) {
  const $location = $event
    .find(".field--name-localgov-event-location, .field--name-field-address")
    .first();
  const { organization, addressLine1, address } = getAddressParts($, $location);

  const venueName =
    getText(
      $event.find(".field--name-localgov-event-venue .field__item").first(),
    ) ||
    organization ||
    addressLine1;
  if (!venueName) return null;

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

  const dates = getDates($, $event, url);
  if (dates.length === 0) return null;

  const venue = getVenue($, $event, url);
  if (!venue) return null;
  const { venueName, venueAddress, coordinates } = venue;

  const description = getDescription($event);

  // Where the event links on to the venue's own booking page, that's where a
  // performance is booked; otherwise the event page is all there is
  const bookingUrl =
    $event
      .find(".field--name-localgov-event-call-to-action a")
      .first()
      .attr("href") || url;

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
      performances: dates.map((date) =>
        createPerformance({
          date,
          url: bookingUrl,
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

  const moviePages = Object.entries(data.moviePages ?? {});
  const parsedPages = moviePages
    .map(([url, html]) => parseEventPage(html, url, attributes))
    .filter(Boolean);

  // Skipping a page without a date or a venue is only safe while it's the odd
  // one out. If every page lacks one, the field has gone rather than the data.
  if (moviePages.length > 0 && parsedPages.length === 0) {
    throw new Error(
      `None of the ${moviePages.length} event pages for ${attributes.id} has both a date and a venue — the page structure may have changed`,
    );
  }

  const events = [];

  for (const { venueName, venueAddress, coordinates, event } of parsedPages) {
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
