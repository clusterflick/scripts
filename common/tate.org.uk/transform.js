const cheerio = require("cheerio");
const { parse } = require("date-fns");
const {
  getText,
  createPerformance,
  createOverview,
  generateShowingId,
} = require("../utils");

function parseDateTime(dateTimeString) {
  // Format: "28 February 2026 at 14.00–16.00"
  const cleaned = dateTimeString
    .replace(/(\d{1,2})\.(\d{2})/g, "$1:$2") // convert 14.00 to 14:00
    .replace(/[–-]\d{1,2}:\d{2}/, ""); // remove end time (e.g., "–16.00")

  return parse(cleaned.trim(), "d MMMM yyyy 'at' HH:mm", new Date());
}

function getEventIdFromUrl(url) {
  // Extract a unique ID from the URL path
  const path = new URL(url).pathname;
  return path.split("/").filter(Boolean).pop() || path;
}

function extractDuration(text) {
  // Match patterns like "The film duration is 94 minutes" or "94 mins" or "94min"
  const match = text.match(/\s+(\d+)\s*(?:minutes?|mins?)\b/i);
  return match ? match[1] : undefined;
}

async function transform(attributes, { moviePages }, sourcedEvents) {
  const shows = [];

  for (const [url, html] of Object.entries(moviePages)) {
    const $ = cheerio.load(html);
    const $filmEvent = $("article.event");
    const title = getText($filmEvent.find("h1")).replace(/\s+/g, " ").trim();
    const eventId = getEventIdFromUrl(url);
    const dateTimeText = getText($filmEvent.find(".splash-header__dates"));
    const bookingUrl =
      $filmEvent.find('a[href*="ticket"]').first().attr("href") || url;

    const bodyText = getText($filmEvent.find(".content__body-text"));
    const description = $filmEvent
      .find(".container__inner > .block-rich_text > *")
      .toArray()
      .map((el) => getText($(el)))
      .join("\n\n");

    shows.push({
      showingId: generateShowingId(attributes, eventId),
      title,
      url,
      overview: createOverview({
        duration: extractDuration(bodyText),
      }),
      performances: [
        createPerformance({
          date: parseDateTime(dateTimeText),
          url: bookingUrl,
        }),
      ],
      matchingHints: {
        overview: `${getText($filmEvent.find(".content__standfirst"))}\n\n${description}`,
      },
    });
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return shows.concat(listOfSourcedEvents);
}

module.exports = transform;
