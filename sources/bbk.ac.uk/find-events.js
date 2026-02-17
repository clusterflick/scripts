const path = require("node:path");
const cheerio = require("cheerio");
const { parseISO } = require("date-fns");
const {
  generateShowingId,
  createOverview,
  createPerformance,
  getText,
  createAccessibility,
  basicNormalize,
  readJSON,
} = require("../../common/utils");
const { venueMatchesCinema } = require("../../common/source-utils");
const attributes = require("./attributes");

/**
 * Extract the venue name from a movie page for cinema matching
 */
function getVenueName(html) {
  const $ = cheerio.load(html);
  const $content = $("main#main-content").find(".row.column.max-medium");
  const venueText = $content
    .find("strong")
    .filter((_, el) => $(el).text().includes("Venue:"))
    .parent()
    .text();

  if (!venueText) return null;
  if (basicNormalize(venueText).includes("online")) return null;

  // Strip "Venue:" prefix to get just the venue name
  return venueText.split(/Venue:/i)[1]?.trim();
}

/**
 * Parse a movie page and create an event object
 */
function parseMoviePage(url, html) {
  const $ = cheerio.load(html);
  const $main = $("main#main-content");
  const $content = $main.find(".row.column.max-medium");

  const title = getText($main.find("h1.page-title"));

  // Extract event ID from URL (e.g., /events/event/57592/...)
  const idMatch = url.match(/\/event\/(\d+)\//);
  const id = idMatch ? idMatch[1] : url;
  const showingId = generateShowingId(attributes, id);

  // Get the datetime from the time element
  const $time = $content.find("time").first();
  const datetime = $time.attr("datetime");
  const date = parseISO(datetime);

  // Get booking URL
  const $bookingLink = $content
    .find("a")
    .filter((_, el) => $(el).attr("href")?.includes("/booking/"));
  const bookingUrl = $bookingLink.attr("href") || url;

  const descriptionParts = [];
  const $bookingParagraph = $bookingLink.closest("p");
  let $current = $bookingParagraph.next();
  while ($current.length) {
    const text = getText($current);
    if (text.includes("Contact name:")) {
      break;
    }
    if (text.trim()) {
      descriptionParts.push(text);
    }
    $current = $current.next();
  }
  const description = descriptionParts.join("\n\n").trim();

  return {
    showingId,
    title,
    url,
    overview: createOverview({}),
    performances: [
      createPerformance({
        date,
        url: bookingUrl,
        notesList: [],
        accessibility: createAccessibility(title, {}, description),
      }),
    ],
    matchingHints: { overview: description },
  };
}

/**
 * Find events matching a specific cinema
 */
async function findEvents(cinema) {
  const dataSrc = path.join(process.cwd(), "retrieved-data", "bbk.ac.uk");

  let data = {};
  try {
    data = await readJSON(dataSrc);
  } catch {
    return [];
  }

  const moviePages = data.moviePages || {};
  const events = [];

  for (const [url, html] of Object.entries(moviePages)) {
    const venueName = getVenueName(html);
    if (!venueName) continue;

    if (!venueMatchesCinema(cinema, venueName)) continue;

    events.push(parseMoviePage(url, html));
  }

  return events;
}

module.exports = findEvents;
