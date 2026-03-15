const cheerio = require("cheerio");
const {
  getText,
  generateShowingId,
  createPerformance,
  createOverview,
  createAccessibility,
} = require("../../common/utils");
const attributes = require("./attributes");
const { parseEventDate } = require("./utils");

// Extract page_id from the incOpt JavaScript variable in the page
const getPageId = ($) => {
  let pageId;
  $("script").each(function () {
    const scriptContent = $(this).html();
    if (scriptContent && scriptContent.includes("var incOpt")) {
      const match = scriptContent.match(/"page_id"\s*:\s*"(\d+)"/);
      if (match) pageId = match[1];
    }
  });
  if (!pageId) {
    throw new Error("Unable to extract page_id from incOpt");
  }
  return pageId;
};

const getTitle = ($) => {
  return getText($(".contentWrapper h1"));
};

// Extract date/time string from visitInfo section
const getDateTimeString = ($) => {
  const $visitInfo = $(".visitInfo");
  const $dateElement = $visitInfo.find(".icon-calendar").next();
  return getText($dateElement);
};

// Extract location/screen from visitInfo section
const getScreen = ($) => {
  const $visitInfo = $(".visitInfo");
  const $locationElement = $visitInfo.find(".icon-pin").next();
  return getText($locationElement) || undefined;
};

// Get description text for matching hints
const getDescription = ($) => {
  const $content = $(".contentWrapper .content");
  // Get text from paragraphs, excluding accordion sections
  const paragraphs = [];
  $content.find("> p, > h2, > h3").each(function () {
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

    const title = getTitle($);
    if (!title) {
      throw new Error("No title found - the page structure may have changed");
    }

    const dateTimeString = getDateTimeString($);
    if (!dateTimeString) {
      throw new Error(
        "No datetime string found - the page structure may have changed",
      );
    }

    const date = parseEventDate(dateTimeString);
    const screen = getScreen($);
    const eventId = getPageId($);
    const overview = getDescription($);

    const performances = [
      createPerformance({
        date,
        url: moviePageUrl,
        screen,
        accessibility: createAccessibility(title, {}, overview),
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
