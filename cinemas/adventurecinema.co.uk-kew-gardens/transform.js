const cheerio = require("cheerio");
const { parse } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const {
  getText,
  generateShowingId,
  createPerformance,
  createOverview,
  createAccessibility,
  basicNormalize,
} = require("../../common/utils");
const attributes = require("./attributes");

function getTrailer($) {
  const embedUrl = $("iframe[src*='youtube']").first().attr("src");
  const videoId = embedUrl?.match(/embed\/([^?]+)/)?.[1];
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : undefined;
}

function getBookingUrl(mainSection) {
  const ebId = mainSection
    .find("[data-eb-event-id]")
    .first()
    .attr("data-eb-event-id");
  return `https://www.eventbrite.com/checkout-external?eid=${ebId}`;
}

function isSoldOut(mainSection) {
  const alertText = mainSection.find(".psLabel--alert").text().trim();
  return basicNormalize(alertText).includes("sold out");
}

function getSynopsis($) {
  const section = $(".statementText");
  section.find("h2").remove();
  return section.text().trim().replace(/\s+/g, " ");
}

function matchShowtimeParts(showtimeStr) {
  return showtimeStr.match(/Showtime:\s*(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})/);
}

function getDurationMins(showtimeStr) {
  const match = matchShowtimeParts(showtimeStr);
  if (!match) return undefined;

  const startMins = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  const endMins = parseInt(match[3], 10) * 60 + parseInt(match[4], 10);
  return endMins - startMins;
}

function parseShowtime(dateStr, showtimeStr) {
  const match = matchShowtimeParts(showtimeStr);
  if (!match) throw new Error(`Unable to parse showtime: ${showtimeStr}`);

  const parsed = parse(
    `${dateStr} ${match[1]}:${match[2]}`,
    "EEEE, MMMM d HH:mm",
    new Date(),
    { locale: enGB },
  );

  if (isNaN(parsed.getTime())) {
    throw new Error(`Unable to parse date: ${dateStr} ${match[1]}:${match[2]}`);
  }

  return parsed;
}

async function transform({ moviePages }, sourcedEvents) {
  const movies = [];

  for (const [url, html] of Object.entries(moviePages)) {
    const $ = cheerio.load(html);
    const mainSection = $(".fullscreenMediaBanner");

    const classification = getText(
      mainSection.find("[data-autoscale-heading-suffix]").first(),
    );
    mainSection.find("[data-autoscale-heading-suffix]").remove();
    const title = getText(mainSection.find("h1")).replace(/\s+/g, " ").trim();

    const rawDate = getText(mainSection.find("h3").first())
      .split("\n")[0]
      .trim();

    const infoSpans = $(".eventInfoPanel span")
      .map((i, el) => getText($(el)))
      .get()
      .filter(Boolean);

    const showtimeSpan = infoSpans.find((s) => s.startsWith("Showtime:"));
    if (!showtimeSpan) {
      throw new Error(
        `No showtime found for ${url} — page structure may have changed`,
      );
    }

    const slug = url.split("/event/")[1].replace(/\/$/, "");
    const synopsis = getSynopsis($);

    movies.push({
      showingId: generateShowingId(attributes, slug),
      title,
      url,
      overview: createOverview({
        classification,
        duration: getDurationMins(showtimeSpan),
        trailer: getTrailer($),
      }),
      performances: [
        createPerformance({
          date: parseShowtime(rawDate, showtimeSpan),
          notesList: [infoSpans.find((s) => s.startsWith("Gates:"))],
          url: getBookingUrl(mainSection),
          status: isSoldOut(mainSection) ? { soldOut: true } : {},
          accessibility: createAccessibility(title, {}, synopsis),
        }),
      ],
      matchingHints: {
        overview: synopsis,
      },
    });
  }

  // Out of season the listing has no event pages, which is legitimate. Only
  // treat zero movies as an error when there were pages that failed to parse.
  if (movies.length === 0 && Object.keys(moviePages).length > 0) {
    throw new Error("No movies found — page structure may have changed");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
