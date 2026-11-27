const cheerio = require("cheerio");
const {
  getText,
  generateShowingId,
  createPerformance,
  createOverview,
  createAccessibility,
  createOccasions,
  createFormat,
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
  // The listing is ACF's film tag, which also carries partner events held
  // elsewhere, so a run where every event is somewhere else is a real listing
  // with nothing on here - only finding no event pages at all means the parse
  // broke.
  if (Object.keys(moviePages).length === 0) {
    throw new Error("No movies found - the page structure may have changed");
  }

  const movies = [];

  for (const [moviePageUrl, moviePage] of Object.entries(moviePages)) {
    const $ = cheerio.load(moviePage);

    // Skip events not at ACF London. The location sits in the booking block,
    // beside the "Book Tickets" link. A page without that block at all is a
    // changed page, not a skip.
    const bookingBlock = $(".event-booking");
    if (bookingBlock.length === 0) {
      throw new Error(
        `No booking block found on ${moviePageUrl} - the page structure may have changed`,
      );
    }
    // A booking block with nothing in it - no location and nothing to book -
    // is how ACF lists a partner event it isn't hosting ("Ice Station 2026",
    // November 2026, held at the RGS). Nothing places it at ACF, so it is
    // skipped rather than listed there.
    const locationBlock = bookingBlock.find(".location-block");
    if (locationBlock.length === 0 && getText(bookingBlock) === "") {
      console.log(
        ` - Skipped (no location or booking on the page): ${moviePageUrl}`,
      );
      continue;
    }
    if (locationBlock.length === 0) {
      throw new Error(
        `No location found on ${moviePageUrl} - the page structure may have changed`,
      );
    }
    const location = basicNormalize(getText(locationBlock));
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
          format: createFormat(title, {}, description),
          occasions: createOccasions(title, {}, description, { date }),
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
