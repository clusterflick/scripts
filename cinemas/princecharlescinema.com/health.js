const cheerio = require("cheerio");
const { format } = require("date-fns");
const { getText, isPrivateHire } = require("../../common/utils");
const {
  probeText,
  probeError,
  startObservation,
  withChallengeRetry,
} = require("../../common/health-probe");
const { parseDate } = require("./utils");
const attributes = require("./attributes");

// A single venue rather than a chain, so this hangs off the cinema module
// alongside `retrieve` and `transform` rather than sitting under `common/`.
//
// The whole listing is one page - the same page the retrieve fetches - so the
// probe costs exactly what a retrieve does. It is here for the observation, not
// the saving: what it avoids is the transform, not the request.
const GRANULARITY = "performance";

// Reuses the venue's own `parseDate`, which carries the year-boundary rule (a
// December date scraped in January belongs to next year). Duplicating that here
// would be a second place for it to drift.
const tally = (html) => {
  const $ = cheerio.load(html);
  const entries = $(".jacro-event");
  if (entries.length === 0) {
    throw probeError("No `.jacro-event` entries on the what's-on page");
  }

  const films = new Set();
  const byDate = {};

  entries.each(function () {
    const $entry = $(this);
    const $title = $entry.find(".jacrofilm-list-content .liveeventtitle");
    // Private hires are bookings of the screen, not screenings; the transform
    // drops them, so counting them here would report listings we never publish.
    if (isPrivateHire(getText($title))) return;

    const id = ($title.attr("href") ?? "").match(/\/film\/([^/]+)\//i)?.[1];

    $entry.find(".performance-list-items .heading").each(function () {
      const $heading = $(this);
      const date = format(parseDate(getText($heading)), "yyyy-MM-dd");

      // Performances are siblings following their date heading rather than
      // children of it, so walk forward until the next heading.
      let $current = $heading.next();
      let count = 0;
      while ($current.is("li")) {
        count += 1;
        $current = $current.next();
      }

      if (count === 0) return;
      byDate[date] = (byDate[date] ?? 0) + count;
      if (id) films.add(id);
    });
  });

  return { films, byDate };
};

async function health(venues) {
  const { countRequest, reasonFor, finalise } = startObservation(GRANULARITY);
  const [venue] = venues;

  let byDate;
  let films;
  try {
    const html = await withChallengeRetry(
      () => probeText(`${attributes.domain}/whats-on/`),
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
        performances: dates.reduce((total, d) => total + byDate[d], 0),
        films: films.size,
        dates: dates.length,
      },
      // Sorted so consecutive cycles diff cleanly.
      byDate: Object.fromEntries(dates.map((d) => [d, byDate[d]])),
    },
  ]);
}

module.exports = health;
