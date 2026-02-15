const cheerio = require("cheerio");
const {
  getText,
  generateShowingId,
  createPerformance,
  createOverview,
  createAccessibility,
  basicNormalize,
} = require("../../common/utils");
const attributes = require("./attributes");
const { parseDate } = require("./utils");

// Get only the description relevant to this film (before "FULL PROGRAMME" which lists other films)
const getRelevantDescription = (description) => {
  return description.split("FULL PROGRAMME")[0].trim();
};

// Extract year, duration, and director from description text
// Format: "2012, 100 minutes, directed Benoit Jacquot" or "2017, 115min, directed by Albert Serra"
const extractOverviewFromDescription = (description) => {
  // Match pattern: year, duration (minutes/min/mins), directed [by] director
  const match = description.match(
    /(\d{4}),\s*(\d+)\s*min(?:ute)?s?,\s*directed\s*(?:by\s*)?([A-Za-z\s]+?)\s*$/i,
  );

  if (!match) return {};

  return {
    year: match[1],
    duration: match[2],
    directors: match[3].trim(),
  };
};

async function transform({ moviePages }, sourcedEvents) {
  const movies = [];

  for (const [moviePageUrl, moviePage] of Object.entries(moviePages)) {
    const $ = cheerio.load(moviePage);

    // Skip events not at ACF London
    const location = basicNormalize(getText($(".location-block")));
    if (!location.includes(basicNormalize("Austrian Cultural Forum London"))) {
      continue;
    }

    const title = getText($(".detail-title"));
    const description = getRelevantDescription(getText($(".event-desc")));
    const id = $('input[name="event_id"]').val();

    // Parse date and time from detail items
    const detailItems = $(".detail-item");
    const dateString = getText(detailItems.first());
    // Default the time to 7pm if it's been omitted -- all other events are at
    // this time. This should be updated if we learn differently.
    const timeString =
      detailItems.length === 2 ? getText(detailItems.last()) : "7:00PM";
    const dateTimeString = `${dateString} ${timeString}`;
    const date = parseDate(dateTimeString);

    // Extract year, duration, director from description if available
    const overviewData = extractOverviewFromDescription(description);

    movies.push({
      showingId: generateShowingId(attributes, id),
      title,
      url: moviePageUrl,
      overview: createOverview(overviewData),
      performances: [
        createPerformance({
          date,
          url: moviePageUrl,
          accessibility: createAccessibility(title, {}, description),
        }),
      ],
      matchingHints: {
        overview: description,
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
