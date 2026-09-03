const {
  probeText,
  probeJson,
  probeError,
  startObservation,
  withChallengeRetry,
} = require("../health-probe");
const { retrievePaginatedListView } = require("./retrieve");
const { extractJsonLdEvents } = require("./transform");

// Venues running the Tribe "The Events Calendar" plugin are separate sites that
// happen to share a WordPress plugin, not a chain with one listing call, so this
// is a per-venue probe each cinema module exports beside its `retrieve` and
// `transform`, configured with that venue's own view the way its retrieve is.
//
// Each rendered view fragment embeds its events as a JSON-LD array carrying a
// name, a url and a start date, which is everything a probe counts. What it
// skips is the event page the retrieve opens per event for the off-site booking
// link.
//
// Events are individual occurrences in these listings, so this reports
// performance counts.
const GRANULARITY = "performance";

// The listing is counted as the calendar publishes it. These are venues whose
// programme is mostly not film - a bar, a square, an arts centre - and the
// transform drops the sport and the non-film events later. That filtering is a
// judgement about individual listings; this is an observation about whether the
// calendar is answering, so a comedy night counts here and is dropped
// downstream. Stanley Arts is the exception only because its own view params
// already ask for the film category.
//
// `startDate` carries an offset ("2026-09-01T20:00:00+00:00") that the venues
// disagree about - Coldharbour parses it as wall time and ignores the offset,
// Stanley honours it - so the date counted here is the one the listing states
// rather than one re-derived from a timezone the calendars don't agree on.
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}/;

const tally = (pages) => {
  const films = new Set();
  const byDate = {};
  const unparsed = [];

  for (const page of pages) {
    for (const event of extractJsonLdEvents(page)) {
      const date = event.startDate?.match(DATE_TIME)?.[1];
      if (!date) {
        unparsed.push(event.startDate ?? `(no startDate on "${event.name}")`);
        continue;
      }
      byDate[date] = (byDate[date] ?? 0) + 1;
      // The event url rather than its name: a listing renders the same film's
      // name for each occurrence, and the retrieve keys its event pages on this.
      if (event.url) films.add(event.url);
      else unparsed.push(`(event "${event.name}" has no url)`);
    }
  }

  if (unparsed.length > 0) {
    throw probeError(
      `${unparsed.length} listed event(s) were unreadable (e.g. "${unparsed[0]}")`,
    );
  }

  return { films, byDate };
};

// `view` is the same `{ domain, initialPageUrl, buildParams, maxPages }` the
// retrieve helper takes, so a venue configures its probe the way it configures
// its retrieve.
const createHealth = (view) =>
  async function health(venues) {
    const { countRequest, reasonFor, finalise } = startObservation(GRANULARITY);
    const [venue] = venues;

    let films;
    let byDate;
    try {
      // Wrapped as one unit rather than per page: the nonce is issued to the
      // session that fetched the first page, so a challenge part-way through
      // has to start the walk again rather than resume it.
      const { movieListPages } = await withChallengeRetry(
        () =>
          retrievePaginatedListView({
            ...view,
            fetchers: {
              text: (url) => {
                countRequest();
                return probeText(url);
              },
              json: (url) => {
                countRequest();
                return probeJson(url);
              },
            },
          }),
        venue.id,
      );
      ({ films, byDate } = tally(movieListPages));
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
  };

module.exports = createHealth;
