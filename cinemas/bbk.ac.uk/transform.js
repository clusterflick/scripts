const cheerio = require("cheerio");
const { parseISO } = require("date-fns");
const {
  generateShowingId,
  createOverview,
  createPerformance,
  getText,
  createAccessibility,
  basicNormalize,
} = require("../../common/utils");
const attributes = require("./attributes");

async function transform({ moviePages }, sourcedEvents) {
  const movies = [];

  for (const [url, html] of Object.entries(moviePages)) {
    const $ = cheerio.load(html);
    const $main = $("main#main-content");
    const $content = $main.find(".row.column.max-medium");

    // Check if it's an in-person event (not online)
    const venueText = $content
      .find("strong")
      .filter((_, el) => $(el).text().includes("Venue:"))
      .parent()
      .text();
    const isOnline = basicNormalize(venueText).includes("online");
    if (isOnline) {
      continue;
    }

    const title = getText($main.find("h1.page-title"));

    // Extract event ID from URL (e.g., /events/event/57592/...)
    const idMatch = url.match(/\/event\/(\d+)\//);
    const id = idMatch ? idMatch[1] : url;
    const showingId = generateShowingId(attributes, id);

    // Get the datetime from the time element
    const $time = $content.find("time").first();
    const datetime = $time.attr("datetime");
    const date = parseISO(datetime);

    // Get booking URL
    const $bookingLink = $content
      .find("a")
      .filter((_, el) => $(el).attr("href")?.includes("/booking/"));
    const bookingUrl = $bookingLink.attr("href") || url;

    const descriptionParts = [];
    const $bookingParagraph = $bookingLink.closest("p");
    let $current = $bookingParagraph.next();
    while ($current.length) {
      const text = getText($current);
      if (text.includes("Contact name:")) {
        break;
      }
      if (text.trim()) {
        descriptionParts.push(text);
      }
      $current = $current.next();
    }
    const description = descriptionParts.join("\n\n").trim();

    movies.push({
      showingId,
      title,
      url,
      overview: createOverview({}),
      performances: [
        createPerformance({
          date,
          url: bookingUrl,
          notesList: [],
          accessibility: createAccessibility(title, {}),
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
