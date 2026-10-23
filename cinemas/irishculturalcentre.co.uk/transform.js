const cheerio = require("cheerio");
const {
  generateShowingId,
  createOverview,
  createPerformance,
  getText,
  createAccessibility,
  createFormat,
} = require("../../common/utils");
const { parse } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const attributes = require("./attributes");

// The event page's whole description: the tagline and body in the content
// column, then the coloured boxes below it ("About the Film", "About the Cast").
// The listing card's excerpt can stop before anything that identifies the film.
function getEventDescription(eventPage) {
  const $ = cheerio.load(eventPage);
  const sections = [
    ...$(".back-link").parent().children().not("h1, .back-link").toArray(),
    ...$(".event_content_box").toArray(),
  ];
  return sections
    .map((section) => getText($(section)))
    .filter(Boolean)
    .join("\n\n");
}

async function transform({ movieListPage, eventPages }, sourcedEvents) {
  const $ = cheerio.load(movieListPage);
  const movies = [];

  $(".project-post").each((_, element) => {
    const $post = $(element);

    const title = getText($post.find(".project-bottom h3"));
    const url = $post.find("a.project-link").attr("href");

    // Get date and time from the direct p children of project-bottom
    const paragraphs = $post.find(".project-bottom > p");
    const dateText = getText(paragraphs.eq(0)).trim(); // e.g., "Wed 18 February 2026"
    const timeText = getText(paragraphs.eq(1)); // e.g., "Doors: 7.30pm; Starts: 8pm"

    // Multi-session runs (courses, workshop series) give a date range instead
    // of a date, e.g. "Mon 05 October 2026 - Mon 09 November 2026". The listing
    // page carries no per-session dates, so there's nothing to build
    // performances from - skip the entry rather than invent dates for it.
    if (/\d{4}\s*[-–—]/.test(dateText)) return;

    // Extract the start time from "Starts: 8pm", "Doors: 7.30pm; Starts: 8pm",
    // "7pm Doors, 8pm Start", or a bare time range like "6.30pm-8.30pm"
    const startsMatch =
      timeText.match(/Starts?[:\s]\s*(\d{1,2}(?:[.:]\d{2})?(?:am|pm))/i) ||
      timeText.match(/(\d{1,2}(?:[.:]\d{2})?(?:am|pm))\s+Starts?\b/i) ||
      timeText.match(/^(\d{1,2}(?:[.:]\d{2})?(?:am|pm))\s*-/i);
    if (!startsMatch) {
      throw new Error(`Could not extract start time from "${timeText}"`);
    }
    const startTime = startsMatch[1].replace(".", ":");

    // Combine date and time and parse together (e.g., "Wed 18 February 2026 8pm")
    const dateTimeText = `${dateText} ${startTime}`;
    const format = startTime.includes(":")
      ? "EEE d MMMM yyyy h:mmaa"
      : "EEE d MMMM yyyy haa";
    const date = parse(dateTimeText, format, new Date(), { locale: enGB });

    if (isNaN(date.getTime())) {
      throw new Error(`Could not parse date from "${dateTimeText}"`);
    }

    const id = url
      .replace(`${attributes.domain}/event/`, "")
      .replace(/\/$/, "");
    const showingId = generateShowingId(attributes, id);

    const description = getText($post.find(".project-bottom > div p"));

    const eventPage = eventPages[url];
    if (!eventPage) throw new Error(`No event page retrieved for ${url}`);

    const performance = createPerformance({
      date,
      url,
      notesList: [],
      accessibility: createAccessibility(title, {}, description),
      format: createFormat(title, {}, description),
    });

    movies.push({
      showingId,
      title,
      url,
      overview: createOverview({}),
      performances: [performance],
      matchingHints: { overview: getEventDescription(eventPage) },
    });
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
