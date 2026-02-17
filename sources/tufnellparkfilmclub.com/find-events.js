const path = require("node:path");
const cheerio = require("cheerio");
const { parse } = require("date-fns");
const {
  createPerformance,
  createOverview,
  generateShowingId,
  readJSON,
  createAccessibility,
  getText,
} = require("../../common/utils");
const { venueMatchesCinema } = require("../../common/source-utils");
const attributes = require("./attributes");

/**
 * Parse title text like "Waiting for Guffman (Christopher Guest, USA, 1996)"
 * into { title, director, year }.
 */
function parseTitleText(titleText) {
  const match = titleText.match(/^(.+?)\s*\(([^,]+),\s*[^,]+,\s*(\d{4})\)\s*$/);

  if (!match) {
    return { title: titleText.trim() };
  }

  return {
    title: match[1].trim(),
    directors: match[2].trim(),
    year: match[3].trim(),
  };
}

/**
 * Extract venue address from Google Maps link href like
 * "http://maps.google.com?q=86 Highgate Road London, England, NW5 1PB United Kingdom"
 */
function extractAddress(mapHref) {
  if (!mapHref) return undefined;
  try {
    const url = new URL(mapHref);
    return url.searchParams.get("q") || undefined;
  } catch {
    return undefined;
  }
}

function parseEvent($, article) {
  const $article = $(article);

  const titleText = getText($article.find(".eventlist-title-link"));
  const { title, directors, year } = parseTitleText(titleText);

  const eventPath = $article.find(".eventlist-title-link").attr("href");
  const eventUrl = eventPath
    ? `${attributes.domain}${eventPath}`
    : attributes.url;
  const eventSlug = eventPath ? eventPath.split("/").pop() : titleText;

  // Date and time
  const dateAttr = $article.find("time.event-date").attr("datetime");
  const startTime = getText($article.find("time.event-time-24hr-start"));
  const dateString = `${dateAttr} ${startTime}`;
  const date = parse(dateString, "yyyy-MM-dd HH:mm", new Date());

  // Duration from start/end times
  const endTime = getText(
    $article.find(".event-time-24hr time.event-time-12hr-end"),
  );
  let duration;
  if (startTime && endTime) {
    const [startH, startM] = startTime.split(":").map(Number);
    const [endH, endM] = endTime.split(":").map(Number);
    duration = (endH - startH) * 60 + (endM - startM);
    if (duration <= 0) duration = undefined;
  }

  // Venue
  const $addressItem = $article.find(".eventlist-meta-address");
  const venueName = $addressItem
    .contents()
    .filter(function () {
      return this.type === "text";
    })
    .text()
    .trim();
  const mapHref = $addressItem
    .find(".eventlist-meta-address-maplink")
    .attr("href");
  const venueAddress = extractAddress(mapHref);

  // Notes / excerpt
  const notes = getText($article.find(".eventlist-excerpt"));

  return {
    venueName,
    venueAddress,
    event: {
      showingId: generateShowingId(attributes, eventSlug),
      title,
      url: eventUrl,
      overview: createOverview({ duration, year, directors }),
      performances: [
        createPerformance({
          date,
          notesList: notes ? [notes] : [],
          url: eventUrl,
          accessibility: createAccessibility(title, {}, notes),
        }),
      ],
      matchingHints: { overview: notes },
    },
  };
}

async function findEvents(cinema) {
  const dataSrc = path.join(
    process.cwd(),
    "retrieved-data",
    "tufnellparkfilmclub.com",
  );

  let data = {};
  try {
    data = await readJSON(dataSrc);
  } catch {
    return [];
  }

  const $ = cheerio.load(data.movieListPage);
  const events = [];

  $(".eventlist-event--upcoming").each((i, article) => {
    const { venueName, venueAddress, event } = parseEvent($, article);

    if (
      venueMatchesCinema(cinema, venueName, undefined, {
        eventAddress: venueAddress,
      })
    ) {
      events.push(event);
    }
  });

  return events;
}

module.exports = findEvents;
