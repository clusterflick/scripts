const cheerio = require("cheerio");
const { parse, addYears, subDays } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const {
  getText,
  generateShowingId,
  createPerformance,
  createOverview,
  createAccessibility,
} = require("../../common/utils");
const attributes = require("./attributes");

// Table dates/times are given as "Wed 29 Jul" + "7 pm" (or "7.30 pm") with no
// year. Parse them, rolling dates well in the past over to next year.
const parsePerformanceDate = (dateText, timeText) => {
  const now = new Date();
  const timeFormat = /\d\.\d/.test(timeText) ? "h.mm a" : "h a";
  let date = parse(`${dateText} ${timeText}`, `EEE d MMM ${timeFormat}`, now, {
    locale: enGB,
  });
  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `Unable to parse performance date: ${dateText} ${timeText}`,
    );
  }
  if (date < subDays(now, 14)) {
    date = addYears(date, 1);
  }
  return date;
};

// The advertised running time is given as e.g. "Running time: 2 hours 5
// minutes, including interval". Return the total length in minutes (the venue's
// stated showing duration, interval included), or undefined if not present.
const parseRunningTimeMinutes = (text) => {
  const match = text.match(
    /Running time:\s*(?:(\d+)\s*hours?)?\s*(?:(\d+)\s*minutes?)?/i,
  );
  if (!match || (!match[1] && !match[2])) return undefined;
  return Number(match[1] || 0) * 60 + Number(match[2] || 0);
};

async function transform({ moviePages }, sourcedEvents) {
  const movies = [];

  for (const [moviePageUrl, moviePage] of Object.entries(moviePages)) {
    const $ = cheerio.load(moviePage);

    const title = getText($("h1").first());
    // The page slug is a stable per-film identifier
    const slug = moviePageUrl.split("/").filter(Boolean).pop();
    // The release year is given in the title, e.g. "Nosferatu (1922) with ..."
    const yearMatch = title.match(/\((\d{4})\)/);
    const classification = getText($(".whatson_event_certificate").first());
    const description = getText($(".EventDetail_Discip").first());
    const duration = parseRunningTimeMinutes(
      getText($(".whatson-single-page-date-time").first()),
    );

    // The film's own dates live in the "Tickets & Times" table. The table is
    // duplicated for desktop/mobile, so only read the first copy.
    const performances = $("#datetime_tbody_web")
      .first()
      .find("tr")
      .map((i, tr) => {
        const cells = $(tr).find("td");
        const dateText = getText(cells.eq(0));
        const timeText = getText(cells.eq(1));
        if (!dateText || !timeText) return undefined;

        // The booking link is server-rendered; only its status is JS-hydrated
        const bookingUrl =
          $(tr).find("a[href*='booking']").attr("href") || moviePageUrl;

        return createPerformance({
          date: parsePerformanceDate(dateText, timeText),
          url: bookingUrl,
          accessibility: createAccessibility(title, {}, description),
        });
      })
      .get()
      .filter(Boolean);

    // Skip films with no listed dates (e.g. fully past or unscheduled)
    if (performances.length === 0) continue;

    movies.push({
      showingId: generateShowingId(attributes, slug),
      title,
      url: moviePageUrl,
      overview: createOverview({
        year: yearMatch ? yearMatch[1] : undefined,
        classification,
        duration,
      }),
      performances,
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
