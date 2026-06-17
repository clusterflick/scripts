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
  getMovieTitleAndYearFrom,
  getId,
  basicNormalize,
} = require("../../common/utils");
const attributes = require("./attributes");

// The date element reads e.g. "MON 29 JUNE - 6:00 PM" (no year — defaults to
// the current year via the reference date).
function parseEventDate(dateText) {
  const [datePart, timePart] = dateText.split(/\s*-\s*/);
  const time = (timePart || "").replace(/\s+/g, "");
  const str = `${datePart} ${time}`;
  const parsed = parse(str, "EEE d MMMM h:mma", new Date(), { locale: enGB });
  if (isNaN(parsed.getTime())) throw new Error(`Unable to parse date: ${str}`);
  return parsed;
}

async function transform({ moviePages }, sourcedEvents) {
  const movies = [];

  for (const [url, page] of Object.entries(moviePages)) {
    const $ = cheerio.load(page);
    const body = $(".page-activity-detail__body");

    // The first paragraph holds the film title (sometimes split across multiple
    // <strong> tags, e.g. "Superman (2025) (" + "12A)"), the second the synopsis.
    const paragraphs = body
      .find("p")
      .map((i, el) => getText($(el)))
      .get();

    const titleRaw = paragraphs[0];
    if (!titleRaw) {
      throw new Error(`No title found for ${url} — page structure may change`);
    }

    const { title: titleWithYear, classification } =
      parseTitleAndClassification(titleRaw);
    const { title, year } = getMovieTitleAndYearFrom(titleWithYear);

    const synopsis = paragraphs[1] || "";
    const dateText = getText($(".page-activity-detail__date")).replace(
      /\s+/g,
      " ",
    );
    const date = parseEventDate(dateText);

    const id = getId(`${basicNormalize(title)}-${dateText}`);
    movies.push({
      showingId: generateShowingId(attributes, id),
      title,
      url,
      overview: createOverview({ classification, year }),
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
