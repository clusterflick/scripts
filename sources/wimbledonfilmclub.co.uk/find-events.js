const path = require("node:path");
const cheerio = require("cheerio");
const { parse, addYears } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const {
  createPerformance,
  createOverview,
  generateShowingId,
  readJSON,
  createAccessibility,
  getText,
  basicNormalize,
} = require("../../common/utils");
const { venueMatchesCinema } = require("../../common/source-utils");
const attributes = require("./attributes");

/**
 * Extract the location from a movie page for venue matching
 */
function getLocation(html) {
  const $ = cheerio.load(html);
  const bodyHtml = $("body").html() || "";
  const locationMatch = bodyHtml.match(/At the ([^<(]+)/);
  return locationMatch?.[1]?.trim() || null;
}

/**
 * Parse a date string like "February 17 8:30pm" or "September 16, 2025 8:00pm"
 * Handles year boundary logic when no year is provided
 */
function parsePerformanceDate($) {
  // Date and time are in separate spans within .scrndate
  const spans = $(".scrndate").find("span");
  const dateText = getText(spans.first());
  const timeText = getText(spans.last());

  if (!dateText || !timeText) {
    throw new Error("Missing date or time");
  }

  const dateString = `${dateText} ${timeText}`;
  const now = new Date();

  // Try parsing with year first
  let performanceDate = parse(dateString, "MMMM d, yyyy h:mma", now, {
    locale: enGB,
  });

  if (isNaN(performanceDate.getTime())) {
    // No year in date, parse without and handle year boundary logic
    performanceDate = parse(dateString, "MMMM d h:mma", now, { locale: enGB });
    if (performanceDate < now) {
      performanceDate = addYears(performanceDate, 1);
    }
  }

  if (isNaN(performanceDate.getTime())) {
    throw new Error(`Failed to parse date "${dateString}"`);
  }

  return performanceDate;
}

/**
 * Extract film information from the Film Information table
 */
function parseFilmInfo($) {
  const info = {};

  $("table tr").each(function () {
    const cells = $(this).find("td");
    if (cells.length >= 2) {
      const label = basicNormalize(getText($(cells[0])));
      const value = getText($(cells[1]));

      if (label.includes("release year")) {
        info.year = value;
      } else if (label.includes("directed by")) {
        info.directors = value;
      } else if (label.includes("starring")) {
        info.actors = value;
      } else if (label.includes("genre")) {
        info.categories = value;
      } else if (label.includes("language")) {
        info.language = value;
      } else if (label.includes("running time")) {
        const minsMatch = value.match(/(\d+)\s*min/i);
        info.duration = parseInt(minsMatch[1], 10);
      } else if (label.includes("classification")) {
        const classificationMatch = $(cells[1])
          .find("img")
          .attr("src")
          ?.match(/BBFC_([^_]+)_/i);
        info.classification = classificationMatch?.[1];
      }
    }
  });

  return info;
}

/**
 * Parse a movie page and create an event object
 */
function parseMoviePage(url, html) {
  const $ = cheerio.load(html);

  // Title from page title (format: "Title – Wimbledon Film Club")
  const title = getText($("title")).replace(
    /\s*[-–—]\s*wimbledon film club/i,
    "",
  );
  const performanceDate = parsePerformanceDate($);
  const { language, ...filmInfo } = parseFilmInfo($);

  // Extract event ID from body class (postid-{id})
  const bodyClass = $("body").attr("class") || "";
  const postIdMatch = bodyClass.match(/postid-(\d+)/);
  if (!postIdMatch) {
    throw new Error(`Missing postid in body class for ${url}`);
  }
  const eventId = postIdMatch[1];

  return {
    showingId: generateShowingId(attributes, eventId),
    title,
    url,
    overview: createOverview({
      ...filmInfo,
      trailer: $('iframe[src*="youtube"]').attr("src"),
    }),
    performances: [
      createPerformance({
        date: performanceDate,
        url: $(".buy_button").parent("a").attr("href") || url,
        status: {},
        accessibility: createAccessibility(title, {
          subtitled: basicNormalize(language || "").includes("subtitles"),
        }),
      }),
    ],
    matchingHints: {
      overview: getText(
        $(".entry-content, .wp-block-post-content").first(),
      ).replace(/\s+/g, " "),
    },
  };
}

/**
 * Find events matching a specific cinema
 */
async function findEvents(cinema) {
  const dataSrc = path.join(
    process.cwd(),
    "retrieved-data",
    "wimbledonfilmclub.co.uk",
  );

  let data = {};
  try {
    data = await readJSON(dataSrc);
  } catch {
    return [];
  }

  const moviePages = data.moviePages || {};
  const events = [];

  for (const [url, html] of Object.entries(moviePages)) {
    const location = getLocation(html);
    if (!location) continue;

    if (!venueMatchesCinema(cinema, location)) continue;

    events.push(parseMoviePage(url, html));
  }

  return events;
}

module.exports = findEvents;
