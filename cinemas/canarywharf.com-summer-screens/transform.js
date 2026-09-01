const cheerio = require("cheerio");
const { parse } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const {
  getText,
  generateShowingId,
  createPerformance,
  createOverview,
  createAccessibility,
  createFormat,
  parseTitleAndClassification,
  getId,
  basicNormalize,
} = require("../../common/utils");
const { getExpectedClosure } = require("../../common/expected-closures");
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
          format: createFormat(title, {}, synopsis),
        }),
      ],
      matchingHints: {
        overview: synopsis,
      },
    });
  });

  if (movies.length === 0) {
    // Summer Screens is a seasonal pop-up, and out of season the estate takes
    // the season's event page down rather than emptying it - so the URL 404s
    // and the accordion is simply absent, which is indistinguishable from a
    // redesign. Stand down only for a declared closure, and say which one, so
    // the empty output is explained in the log rather than silent.
    const closure = getExpectedClosure(attributes.id);
    if (!closure) {
      throw new Error("No movies found — page structure may have changed");
    }
    console.log(
      `      - ⚠️  No listings for ${attributes.id} - closed until ${closure.until} for ${closure.reason}`,
    );
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
