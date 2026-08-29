const cheerio = require("cheerio");
const {
  probeText,
  probeError,
  startObservation,
  withChallengeRetry,
} = require("../health-probe");

// Castle Cinema is two venues on two domains with no listing call in common, so
// there is nothing to batch: this is a per-venue probe each cinema module
// exports beside its `retrieve` and `transform`, not a group under
// `scripts/health`.
//
// `/calendar/` is the page the retrieve fetches first, and it already carries
// every performance - each booking link has its own `data-start-time` under a
// tile carrying the programme id. What the probe skips is the per-programme page
// the retrieve then opens for the overview: 53 of them at Hackney the day this
// was written, so 1 request against a retrieve's 54.
const GRANULARITY = "performance";

// `data-start-time` is a local ISO timestamp ("2026-08-28T11:00:00"), so the
// date is its first ten characters and no parsing is needed. Anything else is a
// shape change worth failing on rather than quietly counting fewer showings.
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}/;

// The same unclosed `<i>` fix the transform applies. The tagsoup it causes can
// re-nest tiles, and the counts here are read from where a tile sits in
// `#slim-tiles`, so the probe has to parse the markup the transform parses.
const fixMarkup = (html) => html.replaceAll("<i>", "").replaceAll("</i>", "");

const tally = (html) => {
  const $ = cheerio.load(fixMarkup(html));
  const $entries = $("#slim-tiles").children();
  if ($entries.length === 0) {
    throw probeError("No `#slim-tiles` entries on the calendar page");
  }

  const films = new Set();
  const byDate = {};
  const unparsed = [];

  $entries.each(function () {
    const $entry = $(this);
    // Date headings and the intro blurb are siblings of the tiles rather than
    // wrappers around them, so they arrive here too. The transform skips
    // exactly these two and then insists on an id; anything else without one is
    // a shape change rather than a tile to pass over.
    if ($entry.hasClass("date") || $entry.hasClass("intro")) return;

    const id = $entry.attr("data-prog-id");
    if (!id) {
      unparsed.push("(tile with no data-prog-id)");
      return;
    }

    $entry.find(".film-times a").each(function () {
      const startTime = $(this).attr("data-start-time");
      const date = startTime?.match(DATE_TIME)?.[1];
      if (!date) {
        unparsed.push(startTime ?? "(no data-start-time)");
        return;
      }
      byDate[date] = (byDate[date] ?? 0) + 1;
      films.add(id);
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
    const html = await withChallengeRetry(
      () => probeText(`${venue.domain}/calendar/`),
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
