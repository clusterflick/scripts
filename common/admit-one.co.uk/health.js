const cheerio = require("cheerio");
const {
  probeText,
  probeError,
  startObservation,
  withChallengeRetry,
} = require("../health-probe");

// Admit One venues are separate sites that happen to share a booking platform,
// not a chain with one listing call, so this is a per-venue probe a cinema
// module exports beside its `retrieve` and `transform`.
//
// The what's-on page is the page the retrieve fetches first, and it is already
// the whole calendar: a `.whatson_panel` per date, each holding that date's
// films and every booking button on them. What the probe skips is the per-film
// page the retrieve then opens for the synopsis and credits - around forty of
// them at Genesis - so 1 request against a retrieve's forty-odd.
//
// Booking buttons are individual showings, so this reports real performance
// counts rather than a film x date matrix.
const GRANULARITY = "performance";

// `panel_20260828`. The date is in the id rather than the markup, which is why
// this probe needs no date parsing at all - and why an id that stops looking
// like this is a shape change worth failing on.
const PANEL_ID = /^panel_(\d{4})(\d{2})(\d{2})$/;

// `event/110457` - relative, as the retrieve's `${domain}/${urlPath}` implies.
// Anchored loosely so it reads either form, but still required: the transform
// throws when it can't take an id out of the same link.
const EVENT_ID = /(?:^|\/)event\/([^/]+)$/i;

const tally = (html) => {
  const $ = cheerio.load(html);
  const $panels = $(".whatson_panel");
  if ($panels.length === 0) {
    throw probeError("No `.whatson_panel` entries on the what's-on page");
  }

  const films = new Set();
  const byDate = {};
  const unparsed = [];

  $panels.each(function () {
    const $panel = $(this);
    const id = $panel.attr("id") ?? "";
    const match = id.match(PANEL_ID);
    if (!match) {
      unparsed.push(id || "(no id)");
      return;
    }
    const [, year, month, day] = match;
    const date = `${year}-${month}-${day}`;

    $panel.find("> div > div").each(function () {
      const $movie = $(this);
      const performances = $movie.find("a.perfButton,span.perfButton").length;
      if (performances === 0) return;

      byDate[date] = (byDate[date] ?? 0) + performances;
      // The event id rather than the title: a venue can list the same film
      // under a strand name, and the retrieve keys on this too. A showing whose
      // link no longer yields one is a shape change - counting its performances
      // and quietly dropping it from the film tally would report a hole as a
      // number.
      const href = $movie.find("h2 a").attr("href") ?? "";
      const eventId = href.match(EVENT_ID)?.[1];
      if (!eventId) {
        unparsed.push(href || "(no event link)");
        return;
      }
      films.add(eventId);
    });
  });

  if (unparsed.length > 0) {
    throw probeError(
      `${unparsed.length} listing(s) had an unreadable date id or event link (e.g. "${unparsed[0]}")`,
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
    // The retrieve decodes this page as win1252 because the listings carry
    // smart quotes and accented titles. Nothing counted below is text - panel
    // ids, event links and button counts are all ASCII - so the probe reads the
    // response as it arrives rather than carrying the decode.
    const html = await withChallengeRetry(
      () => probeText(venue.domain),
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
