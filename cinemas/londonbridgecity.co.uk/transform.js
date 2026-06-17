const cheerio = require("cheerio");
const { parse } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const {
  getText,
  generateShowingId,
  createPerformance,
  createOverview,
  createAccessibility,
  parseTitleAndClassification,
  getId,
  basicNormalize,
} = require("../../common/utils");
const attributes = require("./attributes");

// The date element reads e.g. "02 June 2026 7:00 pm".
function parseEventDate(dateText) {
  const parsed = parse(dateText, "d MMMM yyyy h:mm a", new Date(), {
    locale: enGB,
  });
  if (isNaN(parsed.getTime())) {
    throw new Error(`Unable to parse date: ${dateText}`);
  }
  return parsed;
}

async function transform({ moviePages }, sourcedEvents) {
  const movies = [];

  for (const [url, page] of Object.entries(moviePages)) {
    const $ = cheerio.load(page);
    const content = $(".col-10.content-block-text");

    const titleRaw = getText(content.find("h1").first());
    if (!titleRaw) {
      throw new Error(`No title found for ${url} — page structure may change`);
    }
    const { title, classification } = parseTitleAndClassification(titleRaw);

    // The first non-empty paragraph that isn't the location/entry note is the
    // synopsis (the leading paragraph just holds the poster image).
    const synopsis =
      content
        .find("p")
        .map((i, el) => getText($(el)))
        .get()
        .find(
          (text) =>
            text && !text.startsWith("Location:") && text !== "FREE ENTRY",
        ) || "";

    const dateText = getText(content.find(".article-date")).replace(
      /\s+/g,
      " ",
    );
    const date = parseEventDate(dateText);

    const id = getId(`${basicNormalize(title)}-${dateText}`);
    movies.push({
      showingId: generateShowingId(attributes, id),
      title,
      url,
      overview: createOverview({ classification }),
      performances: [
        createPerformance({
          date,
          url,
          accessibility: createAccessibility(title, {}, synopsis),
        }),
      ],
      matchingHints: {
        overview: synopsis,
      },
    });
  }

  if (movies.length === 0) {
    throw new Error("No movies found — page structure may have changed");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
