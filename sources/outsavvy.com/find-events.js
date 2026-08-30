const path = require("node:path");
const cheerio = require("cheerio");
const {
  readJSON,
  generateShowingId,
  getText,
  createAccessibility,
  createFormat,
} = require("../../common/utils");
const { createOverview, createPerformance } = require("../../common/utils");
const { parseEventDates } = require("./utils");
const attributes = require("./attributes");
const { venueMatchesCinema } = require("../../common/source-utils");

function extractCoordinates($) {
  const mapImg = $(".website-map img[data-src*='marker-point']");
  const dataSrc = mapImg.attr("data-src");

  // Extract coordinates from URL like: marker-point.png(-0.1011974,51.46507)
  // or marker-point-small.png(-0.1011974,51.46507)
  const match =
    dataSrc && dataSrc.match(/marker-point(?:-small)?\.png\(([^,]+),([^)]+)\)/);
  if (!match) return null;

  return {
    lon: parseFloat(match[1]),
    lat: parseFloat(match[2]),
  };
}

function extractEventDetails(html) {
  const $ = cheerio.load(html);

  const title = getText($(".event-item-name").first());
  const venueName = getText($(".event-item-venue span span").first());
  const dateText = getText($("#MainContent_LabelDate2"));
  const description = $(".content-body .event-description span")
    .children()
    .map((i, el) => getText($(el)))
    .get()
    .join("\n")
    .split("\n")
    .map((value) => value.trim())
    .filter((value) => !!value)
    .join("\n");

  return {
    title,
    venueName,
    dateText,
    dates: parseEventDates(dateText, $("script").text()),
    description,
    coordinates: extractCoordinates($),
  };
}

function convertOutsavvyEvent(event) {
  // Extract event ID from URL (e.g., /event/31052/palestine-cinema-days-when-i-saw-you)
  const eventId = event.url.match(/\/event\/(\d+)\//)?.[1] || event.url;

  // Conversion happens after the venue filter, so an event we can't date only
  // fails the transform of the venue it is listed at rather than every venue
  // the source is asked about.
  if (event.dates.length === 0) {
    throw new Error(
      `No date could be read for ${event.url} (published as "${event.dateText}")`,
    );
  }

  return {
    showingId: generateShowingId(attributes, eventId),
    title: event.title,
    url: event.url,
    overview: createOverview({}),
    performances: event.dates.map((date) =>
      createPerformance({
        date,
        url: event.url,
        accessibility: createAccessibility(event.title, {}, event.description),
        format: createFormat(event.title, {}, event.description),
      }),
    ),
    matchingHints: { overview: event.description },
  };
}

async function findEvents(cinema) {
  const dataSrc = path.join(process.cwd(), "retrieved-data", "outsavvy.com");

  let moviePages = {};
  try {
    const data = await readJSON(dataSrc);
    moviePages = data.moviePages || {};
  } catch {
    // Source data may not always be available or required
  }

  const events = [];
  for (const [url, html] of Object.entries(moviePages)) {
    const eventDetails = extractEventDetails(html);
    events.push({ url, ...eventDetails });
  }

  const filteredEvents = events.filter(({ venueName, coordinates }) => {
    return venueMatchesCinema(cinema, venueName, coordinates);
  });

  return filteredEvents.map((event) => convertOutsavvyEvent(event));
}

module.exports = findEvents;
