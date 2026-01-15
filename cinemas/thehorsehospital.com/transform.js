const cheerio = require("cheerio");
const {
  getText,
  generateShowingId,
  createPerformance,
  createOverview,
  createAccessibility,
} = require("../../common/utils");
const attributes = require("./attributes");

function getEventJsonLd($) {
  const scripts = $('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse($(script).html());
      if (data["@type"] === "Event") {
        return data;
      }
    } catch {
      // Ignore parse errors
    }
  }
  return null;
}

async function transform({ moviePages }, sourcedEvents) {
  const movies = [];

  for (const [moviePageUrl, moviePage] of Object.entries(moviePages)) {
    const $ = cheerio.load(moviePage);
    const eventData = getEventJsonLd($);
    const id = $("article.eventitem").attr("data-item-id");
    const title = eventData.name.replace(" — The Horse Hospital", "");
    const date = new Date(eventData.startDate);
    const description = getText($(".sqs-html-content"));

    // Look for a TICKETS button link
    const ticketsLink = $("a.sqs-block-button-element")
      .filter((_, el) => $(el).text().trim() === "TICKETS")
      .attr("href");
    const bookingUrl = ticketsLink || moviePageUrl;

    movies.push({
      showingId: generateShowingId(attributes, id),
      title,
      url: moviePageUrl,
      overview: createOverview({}),
      performances: [
        createPerformance({
          date,
          url: bookingUrl,
          accessibility: createAccessibility(title, {}),
        }),
      ],
      matchingHints: {
        overview: description,
      },
    });
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
