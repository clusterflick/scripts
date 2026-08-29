const cheerio = require("cheerio");
const {
  parse,
  isValid,
  format,
  startOfDay,
  subDays,
  isBefore,
  addYears,
} = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const {
  probeText,
  probeError,
  startObservation,
  withChallengeRetry,
} = require("../health-probe");

// Olympic Studios is three venues on three domains with no listing call in
// common, so there is nothing to batch: this is a per-venue probe each cinema
// module exports beside its `retrieve` and `transform`.
//
// The what's-on page carries two views of the same listings. `#first-tab` is the
// film grid the retrieve reads for its links, and says only which films are on;
// `#second-tab` is the calendar - a `.date-section` per date holding that date's
// booking buttons - and is where the performances are. The retrieve ignores it
// because it needs each film's own page for credits and synopsis; the probe
// wants exactly what the retrieve throws away, so it costs 1 request against a
// retrieve's seventeen at Barnes.
const GRANULARITY = "performance";

// "Friday August 28" - a display heading with no year on it.
const DATE_HEADING = "EEEE LLLL d";

// Times are the button's own label, so anything that isn't one is a shape change
// rather than a missing showing.
const TIME = /^\d{1,2}:\d{2}$/;

// `/film/the-dog-stars` - the link the retrieve follows for the film's own page.
const FILM_LINK = /\/film\/([^/]+)$/i;

// The heading carries no year, so one has to be chosen. A date more than a
// fortnight behind today is a year-boundary case - a December listing read in
// January - while one a few days back is a showing still on the page. The same
// rule the Prince Charles probe uses on the same kind of heading.
const parseHeading = (text) => {
  const parsed = parse(text.trim(), DATE_HEADING, new Date(), { locale: enGB });
  if (!isValid(parsed)) return null;
  const today = startOfDay(new Date());
  return format(
    isBefore(parsed, subDays(today, 14)) ? addYears(parsed, 1) : parsed,
    "yyyy-MM-dd",
  );
};

const tally = (html) => {
  const $ = cheerio.load(html);
  // The tab itself, not its contents: the retrieve asserts `#first-tab` the same
  // way, because the shell is the page and the sections inside it are the
  // listing. A calendar with no dates in it is a venue with nothing on; a page
  // with no calendar on it is a page that has changed.
  if ($("#second-tab").length === 0) {
    throw probeError("No `#second-tab` calendar on the what's-on page");
  }
  const $sections = $("#second-tab .date-section");

  const films = new Set();
  const byDate = {};
  const unparsed = [];

  $sections.each(function () {
    const $section = $(this);
    const heading = $section.find("h3.date-day").first().text();
    const date = parseHeading(heading);
    if (!date) {
      unparsed.push(heading.trim() || "(no heading)");
      return;
    }

    $section.find(".btn-times-fs").each(function () {
      const time = $(this).text().trim();
      if (!TIME.test(time)) {
        unparsed.push(`${date} ${time}`);
        return;
      }
      byDate[date] = (byDate[date] ?? 0) + 1;
    });

    // Every row in a date section is a film with its times, so a link the
    // retrieve would follow but this can't read is a shape change - counting the
    // times underneath it and quietly dropping the film would report a hole as
    // a number.
    $section.find("h5 a").each(function () {
      const href = $(this).attr("href") ?? "";
      const film = href.match(FILM_LINK)?.[1];
      if (!film) {
        unparsed.push(href || "(no film link)");
        return;
      }
      films.add(film);
    });
  });

  if (unparsed.length > 0) {
    throw probeError(
      `${unparsed.length} calendar entr(y/ies) were unreadable (e.g. "${unparsed[0]}")`,
    );
  }

  return { films, byDate };
};

async function health(venues) {
  const { countRequest, reasonFor, finalise } = startObservation(GRANULARITY);
  const [venue] = venues;

  let films;
  let byDate;
  try {
    const html = await withChallengeRetry(() => probeText(venue.url), venue.id);
    countRequest();
    ({ films, byDate } = tally(html));
  } catch (error) {
    countRequest();
    return finalise([{ venue: venue.id, reason: reasonFor(error) }]);
  }

  const dates = Object.keys(byDate).sort();
  if (dates.length === 0) {
    return finalise([
      { venue: venue.id, reason: { kind: "no-listings-found" } },
    ]);
  }

  return finalise([
    {
      venue: venue.id,
      counts: {
        performances: dates.reduce((total, date) => total + byDate[date], 0),
        films: films.size,
        dates: dates.length,
      },
      // Sorted so consecutive cycles diff cleanly.
      byDate: Object.fromEntries(dates.map((date) => [date, byDate[date]])),
    },
  ]);
}

module.exports = health;
