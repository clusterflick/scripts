const cheerio = require("cheerio");
const { format, isBefore, parseISO, startOfDay } = require("date-fns");
const {
  probeText,
  probeJson,
  probeError,
  startObservation,
  withChallengeRetry,
} = require("../../common/health-probe");
const { getEventsUrl, getInstancesUrl } = require("../../common/spektrix");
const {
  spektrixClient,
  getSearchUrl,
  LISTING_LINK,
  CINEMA_GENRE,
} = require("./utils");

// A single venue rather than a chain, so this hangs off the cinema module
// alongside `retrieve` and `transform` rather than sitting under `common/`.
//
// The retrieve walks the venue's what's-on, opens every listing to read its
// Spektrix event id out of the page's dataLayer, and then asks Spektrix for that
// event's booking - 45 requests for 18 films. Spektrix will instead hand over
// the whole client's events and instances in two calls, which is where every
// performance the retrieve ends up with comes from anyway.
//
// The listing page is still read, and first, for the reason the chain probes
// read a site list before asking for listings: it is what separates a venue with
// nothing on from a site that has stopped answering with a programme at all.
// Counting from Spektrix alone would leave the venue's own what's-on unchecked,
// and that is the half the retrieve starts from.
//
// So 3 requests against a retrieve's 45, with real performance counts.
const GRANULARITY = "performance";

const tally = (events, instances, today) => {
  // Spektrix carries the whole client - JW3's languages classes, talks and
  // walks alongside its cinema - so the genre is what makes this the venue's
  // film programme rather than its diary.
  const filmEvents = new Map(
    events
      .filter(({ attribute_Genre: genre }) => genre === CINEMA_GENRE)
      .map((event) => [event.id, event]),
  );
  if (filmEvents.size === 0) {
    throw probeError(
      `No events carry a "${CINEMA_GENRE}" genre - the attribute may have been renamed`,
    );
  }

  const films = new Set();
  const byDate = {};
  const unparsed = [];

  for (const instance of instances) {
    if (!filmEvents.has(instance.event?.id)) continue;
    // Cancelled instances aren't bookable and aren't listed, the same rule the
    // retrieve's `getBookableInstances` applies.
    if (instance.cancelled) continue;

    const start = parseISO(instance.start ?? "");
    if (isNaN(start.getTime())) {
      unparsed.push(instance.start ?? "(no start)");
      continue;
    }
    // `startFrom` trims most of the past off server-side, but an event's run
    // still arrives whole, and the booking call the retrieve makes answers with
    // what is still to come. Drop the rest here so the two agree.
    if (isBefore(start, today)) continue;

    const date = format(start, "yyyy-MM-dd");
    byDate[date] = (byDate[date] ?? 0) + 1;
    films.add(instance.event.id);
  }

  if (unparsed.length > 0) {
    throw probeError(
      `${unparsed.length} instance(s) had an unreadable start (e.g. "${unparsed[0]}")`,
    );
  }

  return { films, byDate };
};

async function health(venues) {
  const { countRequest, reasonFor, finalise } = startObservation(GRANULARITY);
  const [venue] = venues;
  const today = startOfDay(new Date());

  let films;
  let byDate;
  try {
    const listing = await withChallengeRetry(
      () => probeText(getSearchUrl(0)),
      venue.id,
    );
    countRequest();
    if (cheerio.load(listing)(LISTING_LINK).length === 0) {
      throw probeError(
        `No \`${LISTING_LINK}\` entries on the what's-on page - the venue's own listing is empty or has changed shape`,
      );
    }

    const events = await withChallengeRetry(
      () => probeJson(getEventsUrl(spektrixClient)),
      venue.id,
    );
    countRequest();
    const instances = await withChallengeRetry(
      () =>
        probeJson(
          getInstancesUrl(spektrixClient, format(today, "yyyy-MM-dd")),
        ),
      venue.id,
    );
    countRequest();

    ({ films, byDate } = tally(events, instances, today));
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
