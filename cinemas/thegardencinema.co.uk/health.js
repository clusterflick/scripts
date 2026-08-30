const cheerio = require("cheerio");
const { format } = require("date-fns");
const { getText } = require("../../common/utils");
const {
  probeText,
  probeError,
  startObservation,
  withChallengeRetry,
} = require("../../common/health-probe");
const { parseDate, LISTING_PAGE_DATE } = require("./utils");
const attributes = require("./attributes");

// A single venue rather than a chain, so this hangs off the cinema module
// alongside `retrieve` and `transform` rather than sitting under `common/`.
//
// The what's-on page the retrieve fetches first carries the whole programme
// twice over - once by title, once by date - and the by-date view already holds
// every screening: a `.date-block` per day, each film inside it carrying its own
// booking links. What the probe skips is the per-film page the retrieve then
// opens for the synopsis and credits, 102 of them the day this was written, so
// 1 request against a retrieve's 103.
const GRANULARITY = "performance";

// Only the by-date view is counted. The by-title view lists the same screenings
// again, and totalling both would double every performance.
const tally = (html) => {
  const $ = cheerio.load(html);
  const $blocks = $(".films-list__by-date__inner > .date-block");
  if ($blocks.length === 0) {
    throw probeError("No `.date-block` entries in the by-date listing");
  }

  const films = new Set();
  const byDate = {};
  const unparsed = [];

  $blocks.each(function () {
    const $block = $(this);
    const dateTitle = getText(
      $block.find(".films-list__by-date__date__title").first(),
    );

    $block.find(".films-list__by-date__film").each(function () {
      const $film = $(this);
      // The film's own page url rather than its title: the listing renders the
      // title with its certificate and any season name wrapped around it, and
      // the retrieve keys on this link too.
      const href = $film
        .find(".films-list__by-date__film__title a")
        .attr("href");

      $film.find(".screening-panel .screening-time").each(function () {
        // The date lives on the block and the time on the screening, so a
        // screening is only countable with both.
        let date;
        try {
          date = format(
            parseDate(`${dateTitle} T ${getText($(this))}`, LISTING_PAGE_DATE),
            "yyyy-MM-dd",
          );
        } catch {
          unparsed.push(`${dateTitle} ${getText($(this))}`.trim() || "(empty)");
          return;
        }

        byDate[date] = (byDate[date] ?? 0) + 1;
        if (href) films.add(href);
        else unparsed.push("(screening with no film link)");
      });
    });
  });

  if (unparsed.length > 0) {
    throw probeError(
      `${unparsed.length} screening(s) were unreadable (e.g. "${unparsed[0]}")`,
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
    const html = await withChallengeRetry(
      () => probeText(attributes.url),
      venue.id,
    );
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
