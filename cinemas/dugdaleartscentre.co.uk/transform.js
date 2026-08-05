const cheerio = require("cheerio");
const { parseISO } = require("date-fns");
const {
  getText,
  generateShowingId,
  createPerformance,
  createOverview,
  createAccessibility,
  createFormat,
} = require("../../common/utils");
const { extractPeopleNames } = require("../../common/extract-people");
const attributes = require("./attributes");

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

  for (const [moviePageUrl, { moviePage, booking, eventId }] of Object.entries(
    moviePages,
  )) {
    const $movie = cheerio.load(moviePage);

    const title = getText($movie(".details .title-and-type h2"));
    if (!title) {
      throw new Error(`No title found for ${moviePageUrl}`);
    }

    const $description = cheerio.load(booking.htmlDescription || "").root();
    const overview = getMatchingDescription($description);

    // Extract showtimes from the Spektrix instances
    const performances = booking.instances
      .filter(({ cancelled }) => !cancelled)
      .map(({ start, availability }) =>
        createPerformance({
          date: parseISO(start),
          url: moviePageUrl,
          accessibility: createAccessibility(title, {}, overview),
          format: createFormat(title, {}, overview),
          status: {
            soldOut: availability.available === 0,
          },
        }),
      );

    if (performances.length === 0) {
      // It's possible for an entry to be added which doesn't yet have any
      // performances. For now, skip the entry. We'll still catch if the page
      // structure changes with the `movies.length` check below.
      continue;
    }

    movies.push({
      showingId: generateShowingId(attributes, eventId),
      title,
      url: encodeURI(moviePageUrl),
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
