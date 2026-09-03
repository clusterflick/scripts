const cheerio = require("cheerio");
const { format } = require("date-fns");
const { getText } = require("../../common/utils");
const {
  probeText,
  probeError,
  startObservation,
  withChallengeRetry,
} = require("../../common/health-probe");
const { parseListingDateTime } = require("./utils");
const { url } = require("./attributes");

// A single venue rather than a chain, so this hangs off the cinema module
// alongside `retrieve` and `transform` rather than sitting under `common/`.
//
// The what's-on listing, filtered to film, states each entry's date and time on
// the entry itself, so the probe walks the same pages the retrieve walks and
// stops there. What it skips is the film page the retrieve then opens per
// entry for its performance table and running time.
//
// The venue programmes one-off screenings - silent films with a live score -
// and each entry accordingly states a single showing. An entry stating anything
// else (a run's date range, say) is not counted as one showing: it fails the
// probe by name, because quietly reporting a five-date run as one performance
// would be a number that isn't true.
const GRANULARITY = "performance";

const LISTING_ITEM = ".WhatsOnList .WhatsonItem";
const BOOK_BUTTON = ".BookBtn";
const LISTING_DATE = ".EV_ListDate";

// Same cap and the same stopping signal as the retrieve: a page with no booking
// buttons is past the end. Bounded because this runs hourly.
const MAX_PAGES = 25;

const tally = ($, films, byDate, unparsed) => {
  $(LISTING_ITEM).each(function () {
    const $item = $(this);
    // The booking link rather than the title: the retrieve keys its film pages
    // on the same href, with the "#Tickets_in" fragment dropped.
    const href = $item.find(BOOK_BUTTON).attr("href");
    if (!href) return;

    const dateText = getText($item.find(LISTING_DATE).first());
    let date;
    try {
      date = format(parseListingDateTime(dateText), "yyyy-MM-dd");
    } catch {
      unparsed.push(dateText || "(no date on a listing entry)");
      return;
    }

    byDate[date] = (byDate[date] ?? 0) + 1;
    films.add(href.split("#")[0]);
  });
};

async function health(venues) {
  const { countRequest, reasonFor, finalise } = startObservation(GRANULARITY);
  const [venue] = venues;

  const films = new Set();
  const byDate = {};
  const unparsed = [];

  try {
    // Wrapped as one unit rather than per page: a challenge part-way through a
    // walk has to start the walk again, not resume it.
    await withChallengeRetry(async () => {
      let page = 1;
      while (page <= MAX_PAGES) {
        const html = await probeText(`${url}&event-page=${page}`);
        countRequest();
        const $ = cheerio.load(html);
        if ($(`${LISTING_ITEM} ${BOOK_BUTTON}`).length === 0) return;
        tally($, films, byDate, unparsed);
        page += 1;
      }
      throw probeError(
        `Exceeded ${MAX_PAGES} listing pages - the stopping condition may have changed`,
      );
    }, venue.id);

    if (unparsed.length > 0) {
      throw probeError(
        `${unparsed.length} listing entr(y/ies) did not state a single date and time (e.g. "${unparsed[0]}")`,
      );
    }
  } catch (error) {
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
