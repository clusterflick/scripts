const cheerio = require("cheerio");
const { format } = require("date-fns");
const { getText } = require("../utils");
const {
  probeText,
  probeError,
  startObservation,
  withChallengeRetry,
} = require("../health-probe");
const {
  getFilmSlug,
  walkScreeningPages,
  findScreeningDateText,
  parseScreeningDay,
} = require("./utils");

// Rooftop Cinema Club is one site covering both London venues on separate
// listing paths, so there is nothing to batch: this is a per-venue probe each
// cinema module exports beside its `retrieve` and `transform`.
//
// The probe walks the screenings list and stops where the retrieve fans out - 7
// pages at Peckham the day this was written, for 88 screenings. What it skips is
// the screening-details call the retrieve makes for every sold-out card and the
// film page it opens for every distinct film.
//
// It can skip the details call because only the *time* is missing from a
// sold-out card; the date is on the card either way, and a probe counting per
// date needs the day rather than the clock.
//
// Cards are individual screenings, so this reports real performance counts.
const GRANULARITY = "performance";

// These are seasonal rooftops: they close for the winter, and a listing with
// nothing on it then is the venue being shut rather than anything breaking. It
// is recorded as `no-listings-found` like any other empty listing - a kind that
// keeps the job green - so a winter of empty rows is the log doing its job.
const tally = (html, films, byDate, unparsed) => {
  const $ = cheerio.load(html);

  $(".screening-card").each(function () {
    const $card = $(this);
    const href = $card.find("h3 a").attr("href");
    const dateText = findScreeningDateText($, $card);

    if (!href || !dateText) {
      unparsed.push(getText($card.find("h3 a")) || "(card with no title)");
      return;
    }

    let date;
    try {
      date = format(parseScreeningDay(dateText), "yyyy-MM-dd");
    } catch {
      unparsed.push(dateText);
      return;
    }

    byDate[date] = (byDate[date] ?? 0) + 1;
    // The film slug rather than the title, which is what the retrieve groups a
    // film's screenings by too.
    films.add(getFilmSlug(href));
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
    await withChallengeRetry(
      () =>
        walkScreeningPages(
          (page) => {
            countRequest();
            return probeText(`${venue.url}/screenings/list?page=${page}`);
          },
          (html) => tally(html, films, byDate, unparsed),
        ),
      venue.id,
    );

    if (unparsed.length > 0) {
      throw probeError(
        `${unparsed.length} screening card(s) were unreadable (e.g. "${unparsed[0]}")`,
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
