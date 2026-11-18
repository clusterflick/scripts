const cheerio = require("cheerio");
const { format } = require("date-fns");
const { getText, isPrivateHire } = require("../../common/utils");
const { withCamoufoxSession } = require("../../common/get-page-with-camoufox");
const { getPageEscalating } = require("../../common/camoufox-escalation");
const {
  classifyPage,
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

// Read the way the retrieve reads it: a plain fetch first, and Camoufox once
// Cloudflare refuses it, which it has done to GitHub's runners every cycle since
// 17th November 2026 - see `retrieve.js`. A page that never gets past the
// challenge in the browser either is classified, so it is recorded as the
// challenge it is rather than as a probe error.
const LISTING_URL = `${attributes.domain}/whats-on/`;
const LISTING_SELECTOR = ".jacro-event";

const getListing = () =>
  withCamoufoxSession(
    (getPage) =>
      getPageEscalating(getPage, LISTING_URL, `health--${attributes.id}`, {
        selector: LISTING_SELECTOR,
        onUnsettled: (page, response) =>
          classifyPage(
            page,
            response,
            `No \`${LISTING_SELECTOR}\` on ${LISTING_URL}`,
          ),
      }),
    // An hourly probe must not replay the first answer of the day.
    { disableCache: true },
  );

// Reuses the venue's own `parseDate`, which carries the year-boundary rule (a
// December date scraped in January belongs to next year). Duplicating that here
// would be a second place for it to drift.
const tally = (html) => {
  const $ = cheerio.load(html);
  const entries = $(LISTING_SELECTOR);
  if (entries.length === 0) {
    throw probeError(
      `No \`${LISTING_SELECTOR}\` entries on the what's-on page`,
    );
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
    // Around the whole session, so a retry gets a fresh browser.
    const html = await withChallengeRetry(getListing, venue.id);
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
