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

function normalizeTime(timeStr) {
  return timeStr.replace(".", ":").replace(/^(\d+)(am|pm)$/i, "$1:00$2");
}

function parseEventDate(dayName, dayNum, month, timeStr) {
  const str = `${dayName} ${dayNum} ${month} ${normalizeTime(timeStr)}`;
  const parsed = parse(str, "EEE d MMMM h:mma", new Date(), { locale: enGB });
  if (isNaN(parsed.getTime())) throw new Error(`Unable to parse date: ${str}`);
  return parsed;
}

async function transform({ movieListPage }, sourcedEvents) {
  const $ = cheerio.load(movieListPage);
  const movies = [];

  $(".new-accordion__item table tr").each(function () {
    const cells = $(this)
      .find("td")
      .map((i, el) => getText($(el)))
      .get();
    if (!cells[1]) return;

    const [dayName, dayNum, month, timeStr] = cells.slice(1);
    const { title, classification } = parseTitleAndClassification(cells[0]);
    const synopsis = getText($(this).next("tr").find("td").first());
    const date = parseEventDate(dayName, dayNum, month, timeStr);

    const id = getId(`${basicNormalize(title)}-${dayNum}-${month}`);
    movies.push({
      showingId: generateShowingId(attributes, id),
      title,
      url: attributes.url,
      overview: createOverview({ classification }),
      performances: [
        createPerformance({
          date,
          url: attributes.url,
          accessibility: createAccessibility(title, {}, synopsis),
        }),
      ],
      matchingHints: {
        overview: synopsis,
      },
    });
  });

  if (movies.length === 0) {
    throw new Error("No movies found — page structure may have changed");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
