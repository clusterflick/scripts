const cheerio = require("cheerio");
const {
  getText,
  generateShowingId,
  createPerformance,
  createOverview,
  createAccessibility,
} = require("../../common/utils");
const { extractPeopleNames } = require("../../common/extract-people");
const attributes = require("./attributes");
const { parseSpektrixDate } = require("./utils");

// Extract classification from description text (e.g. "Cert:- 15" or "Cert: 15")
const extractClassification = (text) => {
  const match = text.match(/Cert[:\s-]+(\w+)/i);
  return match ? match[1] : undefined;
};

// Extract trailer URL from description HTML
const extractTrailer = ($description) => {
  const trailerLink = $description.find('a[href*="youtube.com"]').attr("href");
  return trailerLink ? trailerLink : undefined;
};

// Get the description text for matching hints (strip out cert, trailer, and HTML tags)
const getMatchingDescription = ($description) => {
  // Clone to avoid modifying original
  const $clone = $description.clone();
  // Remove trailer links
  $clone.find("a").remove();
  return $clone.text().trim();
};

async function transform({ moviePages }, sourcedEvents) {
  const movies = [];

  for (const [
    moviePageUrl,
    { moviePage, spektrixPage, eventId },
  ] of Object.entries(moviePages)) {
    const $movie = cheerio.load(moviePage);
    const $spektrix = cheerio.load(spektrixPage);

    const title = getText($movie(".details .title-and-type h2"));
    if (!title) {
      throw new Error(`No title found for ${moviePageUrl}`);
    }

    const $description = $spektrix(".DetailsContainer");
    const overview = getMatchingDescription($description);

    // Extract showtimes from the Spektrix select options
    const performances = [];
    $spektrix(".EventDates select option").each(function () {
      const dateText = getText($spektrix(this));
      if (!dateText) return;

      const status = {
        soldOut: dateText.toLowerCase().endsWith("sold out"),
      };

      const date = parseSpektrixDate(dateText.replace(/ - SOLD OUT/i, ""));
      performances.push(
        createPerformance({
          date,
          url: moviePageUrl,
          accessibility: createAccessibility(title, {}, overview),
          status,
        }),
      );
    });

    if (performances.length === 0) {
      throw new Error(`No performances found for ${moviePageUrl}`);
    }

    movies.push({
      showingId: generateShowingId(attributes, eventId),
      title,
      url: moviePageUrl,
      overview: createOverview({
        classification: extractClassification(overview),
        trailer: extractTrailer($description),
      }),
      performances,
      matchingHints: {
        overview,
        crew: extractPeopleNames(overview),
      },
    });
  }

  if (movies.length === 0) {
    throw new Error("No movies found - the page structure may have changed");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
