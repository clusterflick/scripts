const cheerio = require("cheerio");
const {
  getText,
  sanitizeRichText,
  createPerformance,
  createOverview,
  createAccessibility,
  createFormat,
  generateShowingId,
  basicNormalize,
} = require("../../common/utils");
const { parseDate, parseRunningTimeToMins } = require("./utils");
const attributes = require("./attributes");

// The Bush Theatre is primarily a theatre, so most listings are plays rather
// than films. Only include events that are actually film screenings, detected
// via keywords in the title and description.
const FILM_KEYWORDS = [
  "film club",
  "film screening",
  "screening",
  "short films",
  "cinema",
];

function isFilmEvent(title, description) {
  const haystack = basicNormalize(`${title} ${description}`);
  return FILM_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

function getDetailValue($, label) {
  const $row = $(".event_about__details_row").filter(function () {
    return basicNormalize(getText($(this).find(".row_title"))) === label;
  });
  if ($row.length === 0) return undefined;
  return getText($row.first().find(".row_value"));
}

function getStatus($bookCol) {
  return { soldOut: /sold out/i.test(getText($bookCol)) };
}

function getPerformances($, title, overview) {
  const performances = [];
  $(".instance_table__row").each(function () {
    const $row = $(this);
    const dateText = getText($row.find(".instance_table__col--date time"));
    const timeText = getText($row.find(".instance_table__col--time time"));
    if (!dateText || !timeText) return;

    const date = parseDate(dateText, timeText);
    const $bookCol = $row.find(".instance_table__col--book");
    const url = $bookCol.find("a").attr("href");

    performances.push(
      createPerformance({
        date,
        url,
        status: getStatus($bookCol),
        accessibility: createAccessibility(title, {}, overview),
        format: createFormat(title, {}, overview),
      }),
    );
  });
  return performances;
}

async function transform({ eventPages }, sourcedEvents) {
  const movies = [];

  for (const eventPage of eventPages) {
    const $ = cheerio.load(eventPage);

    const title = getText($("h1").first());
    const overview = sanitizeRichText(
      $(".event_about__desc").html() || "",
    ).replace(/^About\s*/i, "");

    if (!isFilmEvent(title, overview)) continue;

    const shortlink = $("link[rel='shortlink']").attr("href");
    const id = new URLSearchParams(new URL(shortlink).search).get("p");
    const url = $('link[rel="canonical"]').attr("href");

    const duration = parseRunningTimeToMins(getDetailValue($, "running time"));

    const performances = getPerformances($, title, overview);
    if (performances.length === 0) continue;

    movies.push({
      showingId: generateShowingId(attributes, id),
      title,
      url,
      overview: createOverview({ duration }),
      performances,
      matchingHints: { overview },
    });
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
