const cheerio = require("cheerio");
const {
  getText,
  generateShowingId,
  createPerformance,
  createOverview,
  createAccessibility,
  createFormat,
  getId,
} = require("../../common/utils");
const attributes = require("./attributes");
const { parseEventDate } = require("./utils");

const getEventIdFromUrl = (url) => {
  const match = url.match(/\/events\/([^/]+)\/?$/);
  if (!match) {
    throw new Error(`Unable to extract event ID from URL: ${url}`);
  }
  return getId(match[1]);
};

const getDescription = ($) => {
  const paragraphs = [];
  $(".event-detail-intro-container")
    .first()
    .find("p")
    .each(function () {
      const text = getText($(this));
      if (text) paragraphs.push(text);
    });
  return paragraphs.join("\n").trim();
};

async function transform({ moviePages }, sourcedEvents) {
  const movies = [];

  for (const [moviePageUrl, moviePage] of Object.entries(moviePages)) {
    const $ = cheerio.load(moviePage);

    // The title is split into a series prefix and the event's own name, and
    // the venue displays them together - "Sonic Cinema: Tony Conrad’s ..."
    const title = getText($(".event-detail-title h1")).replace(/\s+/g, " ");
    if (!title) {
      throw new Error(`No title found for ${moviePageUrl}`);
    }

    const dateText = getText($(".event-detail-date p"));
    if (!dateText) {
      throw new Error(`No date found for ${moviePageUrl}`);
    }

    const overview = getDescription($);

    movies.push({
      showingId: generateShowingId(attributes, getEventIdFromUrl(moviePageUrl)),
      title,
      url: moviePageUrl,
      overview: createOverview({}),
      performances: [
        createPerformance({
          date: parseEventDate(dateText),
          url: moviePageUrl,
          accessibility: createAccessibility(title, {}, overview),
          format: createFormat(title, {}, overview),
        }),
      ],
      matchingHints: { overview },
    });
  }

  // No movies.length === 0 check here: film is an occasional part of a music
  // programme, so most runs find none. Retrieve throws on an empty listing.

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
