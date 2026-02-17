const cheerio = require("cheerio");
const {
  generateShowingId,
  createOverview,
  createPerformance,
  getText,
  createAccessibility,
} = require("../../common/utils");
const { parse } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const attributes = require("./attributes");

async function transform({ movieListPage }, sourcedEvents) {
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

    // Extract the start time (e.g., "8pm" or "7.30pm")
    const startsMatch = timeText.match(
      /Starts[:\s]\s*(\d{1,2}(?:[.:]\d{2})?(?:am|pm))/i,
    );
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

    const performance = createPerformance({
      date,
      url,
      notesList: [],
      accessibility: createAccessibility(title, {}, description),
    });

    movies.push({
      showingId,
      title,
      url,
      overview: createOverview({}),
      performances: [performance],
      matchingHints: { overview: description },
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
