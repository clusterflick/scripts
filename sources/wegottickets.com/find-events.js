const path = require("node:path");
const cheerio = require("cheerio");
const {
  readJSON,
  generateShowingId,
  getText,
  createOverview,
  createPerformance,
  createAccessibility,
  createFormat,
} = require("../../common/utils");
const { venueMatchesCinema } = require("../../common/source-utils");
const { parseEventDate } = require("./utils");
const attributes = require("./attributes");

/**
 * Read a row out of a details table, keyed by the title of its icon cell.
 */
function getRowText($table, title) {
  const $cell = $table.find(`th[title="${title}"]`).next("td");
  if ($cell.length === 0) return null;
  $cell.find("br").replaceWith("\n");
  return getText($cell);
}

/**
 * Extract everything an event page holds about a single screening.
 *
 * Events are published on two kinds of page - "/event/..." and the "/f/..."
 * pages used for events selling more than one kind of ticket - which differ in
 * how the description is marked up but agree on everything else.
 */
function extractEventDetails(html) {
  const $ = cheerio.load(html);

  // The page opens with a table of the event's own details; the venue's
  // address sits in a second one, under the link to the venue's page.
  const $eventDetails = $("table.venue-details").first();
  const $venueDetails = $("span.stupid-size")
    .first()
    .nextAll("table.venue-details")
    .first();

  const $venueCell = $eventDetails.find('th[title="Location"]').next("td");
  // The venue name is followed by an "(info)" link down to that address block
  $venueCell.find('a[href^="#"]').remove();
  // Venues are listed with the town they're in - "LONDON: Pelican House"
  const [town, ...nameParts] = getText($venueCell).split(":");
  const venueName = nameParts.join(":").trim() || town.trim();

  const heading = getText($("h1"));
  // The film being screened is often the subtitle under a heading naming the
  // season or the organiser running the night ("Films4Freedom presents:").
  const subtitle = getText($("p.subtitle"));
  const title = subtitle
    ? `${heading.replace(/:\s*$/, "")}: ${subtitle}`
    : heading;

  const $description = $("h2.stripe-heading")
    .filter((i, el) => getText($(el)) === "Event information")
    .first()
    .next();
  $description.find("br").replaceWith("\n");

  return {
    title,
    venueName,
    venueAddress: $venueDetails.length
      ? getRowText($venueDetails, "Location")
      : null,
    dateText: getRowText($eventDetails, "Date"),
    timeText: getRowText($eventDetails, "Time"),
    description: getText($description),
  };
}

/**
 * The path of an event page identifies it, and keeps the two kinds of page
 * apart - "/f/25577" and "/event/25577" are different events.
 */
function getEventId(url) {
  return new URL(url).pathname.split("/").filter(Boolean).join("-");
}

function convertWeGotTicketsEvent(url, event, date) {
  const { title, description } = event;

  return {
    showingId: generateShowingId(attributes, getEventId(url)),
    title,
    url,
    overview: createOverview({}),
    performances: [
      createPerformance({
        date,
        url,
        accessibility: createAccessibility(title, {}, description),
        format: createFormat(title, {}, description),
      }),
    ],
    matchingHints: { overview: description },
  };
}

/**
 * Find events matching a specific cinema
 */
async function findEvents(cinema) {
  const dataSrc = path.join(
    process.cwd(),
    "retrieved-data",
    "wegottickets.com",
  );

  let moviePages = {};
  try {
    const data = await readJSON(dataSrc);
    moviePages = data.moviePages || {};
  } catch {
    // Source data may not always be available or required
  }

  const events = [];
  for (const [url, html] of Object.entries(moviePages)) {
    const event = extractEventDetails(html);

    if (!event.dateText || !event.timeText) {
      throw new Error(`No date or time found on ${url}`);
    }

    if (
      !venueMatchesCinema(cinema, event.venueName, null, {
        eventAddress: event.venueAddress,
      })
    ) {
      continue;
    }

    const date = parseEventDate(event.dateText, event.timeText);
    if (!date) {
      console.log(`! No start time published for ${url} - skipping`);
      continue;
    }

    events.push(convertWeGotTicketsEvent(url, event, date));
  }

  return events;
}

module.exports = findEvents;
