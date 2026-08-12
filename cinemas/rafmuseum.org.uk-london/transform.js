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
  getMovieTitleAndYearFrom,
  getId,
  basicNormalize,
} = require("../../common/utils");
const attributes = require("./attributes");

// The date paragraph reads e.g. "Saturday 22 August 2026 Film start: 7.30pm
// Doors open (standard tickets): 6.30pm Run time: 1 hour 50 minutes".
function parseEventDate(datePart, timeStr) {
  const time = timeStr.replace(".", ":").replace(/\s+/g, "");
  const str = `${datePart} ${time}`;
  const parsed = parse(str, "EEEE d MMMM yyyy h:mma", new Date(), {
    locale: enGB,
  });
  if (isNaN(parsed.getTime())) throw new Error(`Unable to parse date: ${str}`);
  return parsed;
}

function parseRuntimeMins(text) {
  const hours = text.match(/(\d+)\s*hour/i);
  const mins = text.match(/(\d+)\s*min/i);
  const total = (hours ? +hours[1] : 0) * 60 + (mins ? +mins[1] : 0);
  return total || undefined;
}

async function transform({ movieListPage }, sourcedEvents) {
  const $ = cheerio.load(movieListPage);
  const article = $("article");
  const movies = [];

  // All films share a single event description (the lead paragraphs above the
  // per-film headings).
  const firstFilm = article.find("h6").first();
  const description = firstFilm
    .prevAll("p")
    .map((i, el) => getText($(el)))
    .get()
    .reverse()
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  article.find("h6").each(function () {
    const { title, year } = getMovieTitleAndYearFrom(getText($(this)));

    const section = $(this).nextUntil("h6");
    const info = getText(
      section.filter("p").filter((i, el) => /Film start:/.test($(el).text())),
    ).replace(/\s+/g, " ");

    const datePart = info.split("Film start:")[0].trim();
    const time = (info.match(/Film start:\s*([\d.:]+\s*[ap]m)/i) || [])[1];
    if (!datePart || !time) {
      throw new Error(`Unable to find date/time for "${title}"`);
    }
    const date = parseEventDate(datePart, time);
    const duration = parseRuntimeMins(
      (info.match(/Run time:\s*(.+)$/i) || [])[1] || "",
    );

    const bookingUrl = section.find("a.cta-primary").first().attr("href");

    const id = getId(`${basicNormalize(title)}-${datePart}`);
    movies.push({
      showingId: generateShowingId(attributes, id),
      title,
      url: attributes.url,
      overview: createOverview({ year, duration }),
      performances: [
        createPerformance({
          date,
          url: bookingUrl || attributes.url,
          accessibility: createAccessibility(title, {}, description),
          format: createFormat(title, {}, description),
        }),
      ],
      matchingHints: {
        overview: description,
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
