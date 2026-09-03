const cheerio = require("cheerio");
const { format } = require("date-fns");
const { getText } = require("../../common/utils");
const {
  probeText,
  probeError,
  startObservation,
  withChallengeRetry,
} = require("../../common/health-probe");
const { parseListingDate } = require("./utils");
const { url, domain } = require("./attributes");

// A single venue rather than a chain, so this hangs off the cinema module
// alongside `retrieve` and `transform` rather than sitting under `common/`.
//
// The what's-on page the retrieve fetches first is already the whole programme
// screening by screening: a `.date-title` heading, then that day's entries, and
// a `.time-slot` on each. What the probe skips is the per-film page the retrieve
// then opens for the credits and the booking link - 41 of them the day this was
// written, for 96 screenings - so 1 request against a retrieve's 41.
const GRANULARITY = "performance";

// The whole page is one flat list: date headings and entries are siblings, and
// an entry belongs to the last heading before it. Films sit alongside
// exhibitions, talks and the "The ICA is closed on Mondays" notice, so only
// `.item.films` is counted.
const DATE_TITLE = "date-title";
const FILM_ITEM = ".item.films";

const tally = (html) => {
  const $ = cheerio.load(html);
  const $entries = $(FILM_ITEM);
  if ($entries.length === 0) {
    throw probeError(`No \`${FILM_ITEM}\` entries on the what's-on page`);
  }

  const films = new Set();
  const byDate = {};
  const unparsed = [];

  // Walked from the container rather than by filtering `.item.films` directly,
  // because an entry's date is only knowable from the heading it follows.
  let date = null;
  $entries
    .first()
    .parent()
    .children()
    .each(function () {
      const $child = $(this);

      if ($child.hasClass(DATE_TITLE)) {
        try {
          date = format(parseListingDate(getText($child)), "yyyy-MM-dd");
        } catch {
          date = null;
          unparsed.push(getText($child) || "(empty date title)");
        }
        return;
      }

      if (!$child.is(FILM_ITEM)) return;

      // A screening with no heading above it means the page has been reordered,
      // not that the screening has no date.
      if (!date) {
        unparsed.push("(a film entry with no date heading above it)");
        return;
      }

      // The time is not needed to bucket by date, but its absence means this is
      // not the screening entry it looks like.
      if ($child.find(".time-slot").length === 0) {
        unparsed.push(`(no .time-slot on a film entry under ${date})`);
        return;
      }

      // The film's own page url rather than its title, which is what the retrieve
      // keys its film pages on too.
      const href = $child.children("a").attr("href");
      if (!href) {
        unparsed.push(`(a film entry under ${date} with no link)`);
        return;
      }

      byDate[date] = (byDate[date] ?? 0) + 1;
      films.add(`${domain}${href}`);
    });

  if (unparsed.length > 0) {
    throw probeError(
      `${unparsed.length} listing(s) were unreadable (e.g. "${unparsed[0]}")`,
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
      // The retrieve documents this page answering 404 with the listings in the
      // body regardless, and tolerates it. A probe that didn't would have the
      // stage red for a server misconfiguration the pipeline shrugs off.
      () => probeText(url, undefined, { acceptStatuses: [404] }),
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
