const { parseISO } = require("date-fns");
const cheerio = require("cheerio");
const {
  createOverview,
  createPerformance,
  generateShowingId,
  getText,
  createAccessibility,
} = require("../../common/utils");
const attributes = require("./attributes");

function parseHtmlDescription(htmlDescription) {
  if (!htmlDescription) return "";

  const $ = cheerio.load(htmlDescription);
  // Remove any links to virtual screenings to avoid confusion
  $("a").each(function () {
    const href = $(this).attr("href");
    if (href && href.includes("watch.eventive.org")) {
      $(this).remove();
    }
  });
  return getText($.root()).replace(/\s+/g, " ").trim();
}

function getFilmMetadata(films) {
  if (!films || films.length === 0) return {};

  // Find the primary film (type: "film", not "livestream" or special events)
  const primaryFilm = films.find((f) => f.type === "film") || films[0];
  const { credits = {}, details = {}, description } = primaryFilm;

  return {
    year: details.year,
    duration: details.runtime,
    directors: credits.director,
    actors: credits.cast,
    description: description ? parseHtmlDescription(description) : "",
  };
}

function extractCategories(event) {
  return (event.tags || []).reduce((categories, tag) => {
    if (tag.name && tag.visible) {
      return categories.concat(tag.name);
    }
    return categories;
  }, []);
}

function getTicketStatus(event) {
  // Check if any public ticket bucket has seats remaining
  const publicBuckets = event.ticket_buckets?.filter((b) => b.public) || [];
  const hasSeatsAvailable = publicBuckets.some(
    (bucket) => bucket.unlimited || bucket.quantity_remaining > 0,
  );

  return {
    soldOut: !hasSeatsAvailable,
  };
}

async function transform({ movieListPage }, sourcedEvents) {
  const events = movieListPage.events.filter((event) => !event.is_virtual);

  const movies = events.map((event) => {
    const { films = [] } = event;
    const filmMetadata = getFilmMetadata(films);
    const categories = extractCategories(event);

    const showingId = generateShowingId(attributes, event.id);
    const eventUrl = `${attributes.url}/schedule/${event.id}`;

    // Parse the event description for matching hints
    const eventDescription = parseHtmlDescription(event.description);
    const matchingHintsText = [filmMetadata.description, eventDescription]
      .filter((value) => !!value)
      .join("\n");

    const performance = createPerformance({
      date: parseISO(event.start_time),
      url: eventUrl,
      status: getTicketStatus(event),
      accessibility: createAccessibility(event.name, {}, matchingHintsText),
    });

    return {
      showingId,
      title: event.name,
      url: eventUrl,
      overview: createOverview({
        year: filmMetadata.year,
        duration: filmMetadata.duration,
        directors: filmMetadata.directors,
        actors: filmMetadata.actors,
        categories,
        trailer: event.trailer_url,
      }),
      performances: [performance],
      matchingHints: {
        overview: matchingHintsText,
      },
    };
  });

  if (movies.length === 0) {
    throw new Error("No movies found - the page structure may have changed");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
