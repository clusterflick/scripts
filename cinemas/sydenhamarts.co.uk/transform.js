const cheerio = require("cheerio");
const {
  getText,
  generateShowingId,
  createPerformance,
  createOverview,
  createAccessibility,
  createFormat,
  getId,
  basicNormalize,
} = require("../../common/utils");
const attributes = require("./attributes");
const { parseEventDate } = require("./utils");

// Extract event ID from URL slug
const getEventIdFromUrl = (url) => {
  const match = url.match(/\/events\/([^/]+)\/?$/);
  if (!match) {
    throw new Error(`Unable to extract event ID from URL: ${url}`);
  }
  return getId(match[1]);
};

// Get date from summary list
const getDateString = ($) => {
  const $summaryList = $(".hero .summary-list");
  let dateString;
  $summaryList.find("dt").each(function () {
    if (basicNormalize(getText($(this))) === "date") {
      dateString = getText($(this).next("dd"));
    }
  });
  return dateString;
};

// Get booking URL
const getBookingUrl = ($) => {
  return $(".hero a").attr("href");
};

// Get description for matching hints
const getDescription = ($) => {
  const $overview = $(".content-panel .measure-long");
  const paragraphs = [];
  $overview.find("p").each(function () {
    const text = getText($(this));
    if (text) {
      paragraphs.push(text);
    }
  });
  return paragraphs.join("\n").trim();
};

async function transform({ moviePages }, sourcedEvents) {
  const movies = [];

  for (const [moviePageUrl, moviePage] of Object.entries(moviePages)) {
    const $ = cheerio.load(moviePage);

    const title = getText($(".hero h1"));
    if (!title) {
      throw new Error(`No title found for ${moviePageUrl}`);
    }

    const dateString = getDateString($);
    if (!dateString) {
      throw new Error(`No date found for ${moviePageUrl}`);
    }

    const date = parseEventDate(dateString);
    const bookingUrl = getBookingUrl($);
    const eventId = getEventIdFromUrl(moviePageUrl);
    const overview = getDescription($);

    const performances = [
      createPerformance({
        date,
        url: bookingUrl || moviePageUrl,
        accessibility: createAccessibility(title, {}, overview),
        format: createFormat(title, {}, overview),
      }),
    ];

    movies.push({
      showingId: generateShowingId(attributes, eventId),
      title,
      url: moviePageUrl,
      overview: createOverview({}),
      performances,
      matchingHints: { overview },
    });
  }

  // No movies.length === 0 check here: this is a community cinema that
  // doesn't always have screenings scheduled, so an empty list is expected.

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
