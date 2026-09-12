const cheerio = require("cheerio");
const { format } = require("date-fns");
const { fetchText, sleep, withJitter } = require("../../common/utils.js");
const { dailyCache } = require("../../common/cache.js");
const { getAllCinemaAttributes } = require("../../cinemas");
const { findMatchingCinema } = require("../../common/source-utils");
const { getEventVenue } = require("./utils");
const {
  fetchOrganizerEvents,
  hasFilmShapedTitle,
  normalizeOrganizerEvent,
} = require("./organizer-events");
const attributes = require("./attributes");

function uniqueEvents(events) {
  const ids = {};
  return events.filter((event) => {
    const isNewEvent = !ids[event.id];
    ids[event.id] = true;
    return isNewEvent;
  });
}

// Eventbrite sheds traffic it doesn't like, so give each fetch a retry budget
// to ride the throttle out rather than failing the whole run. It expresses the
// throttle differently on the two surfaces, so they retry differently too.
//
// Search pages: a deep page can come back 404 rather than 429. That is a
// throttling response, not a missing page — Eventbrite answers 200 for pages
// past the end of the results (page 60 of a 49-page search returns an empty
// result set, not a 404), so an out-of-range page never 404s on its own. Treat
// 404 as retryable *here only*; it stays permanent everywhere else.
const SEARCH_RETRY_CONFIG = {
  retries: 4,
  delayMs: 10_000,
  backoffFactor: 2,
  retryStatuses: [404],
};

// Event pages: keep the inline budget short. The failures seen here are
// connection-level, and they routinely outlast any inline retry — the deferred
// sweep below is what actually recovers them, so spending minutes per event
// here just burns the job's wall-clock without improving the odds.
const EVENT_RETRY_CONFIG = { retries: 3, delayMs: 5_000, backoffFactor: 2 };

// Space out requests so we don't provoke the throttle in the first place.
// Eventbrite's threshold is unknown and the block behaves like a temporary IP
// ban (it persists across the whole run rather than clearing on the next
// request), so prevention matters more than retrying — be deliberately slow.
// Jittered so we don't hammer at robotically exact intervals. The /d/... search
// listing endpoints throttle far more aggressively than individual event pages
// (heavier queries, classic scraper target), so pace them separately: search is
// where the blocks actually bite, details cruise through.
const SEARCH_REQUEST_DELAY_MS = 5_000;
const EVENT_REQUEST_DELAY_MS = 2_000;

// Wrap every page fetch in the daily cache. A successfully-fetched page is
// written to disk keyed by today's date, so when a failure kills the run partway
// through, the nick-fields/retry rerun replays the pages we already have (no
// network, no delay) and resumes from where it stopped — instead of
// re-hammering the same pages and keeping the block hot. The throttle lives
// inside the cached function so it only paces real fetches, not replays.
const getPageServerData = (cacheKey, url, delayMs, retryConfig) =>
  dailyCache(cacheKey, async () => {
    await sleep(withJitter(delayMs));
    const html = await fetchText(url, undefined, retryConfig);
    const serverDataMatch = html.match(/\s+window.__SERVER_DATA__ = ({.+});/i);
    if (serverDataMatch) {
      // Remove tabs from string the JSON parser throws on
      return JSON.parse(serverDataMatch[1].replace(/\t/g, " "));
    }

    const $ = cheerio.load(html);
    return JSON.parse($("#__NEXT_DATA__").html());
  });

const getSearchResultsFor = async (searchTerm) => {
  const movieListPages = [];
  let page = 1;
  let lastPage = 1;
  while (page <= lastPage) {
    const url = `${attributes.url}/${searchTerm}/?page=${page}`;
    const pageData = await getPageServerData(
      `eventbrite-search-${searchTerm}-${page}`,
      url,
      SEARCH_REQUEST_DELAY_MS,
      SEARCH_RETRY_CONFIG,
    );

    page += 1;
    lastPage = pageData.page_count;
    movieListPages.push(pageData);
    // Report each page as it lands. These fetches are throttled seconds apart
    // and there are ~90 of them across both searches, so without this the whole
    // pagination phase is one long silence that looks identical to a hung run.
    // (`lastPage` is only known once the first page is back, hence logging
    // after the fetch rather than before it.)
    console.log(`    - ${searchTerm}: page ${page - 1} of ${lastPage}`);
  }
  return movieListPages;
};

/**
 * Whether an event sits at a venue we hold, which is what makes its event page
 * worth a request. Built once per run: findMatchingCinema walks every cinema,
 * and there are over four hundred of them.
 */
function buildKnownVenueTest() {
  const knownCinemas = getAllCinemaAttributes();

  return (event) => {
    const venue = getEventVenue(event);
    if (!venue) return false;

    return !!findMatchingCinema(
      knownCinemas,
      venue.venueName,
      venue.coordinates,
      { eventAddress: venue.eventAddress },
    );
  };
}

/**
 * The events that organisers at venues we hold have on beyond the ones the
 * search reached, in the organiser's own listing shape.
 *
 * Only organisers the search surfaced at least once can be asked - their id
 * arrives on an event, so an organiser whose every listing ranks below the
 * search's cut-off stays invisible to this. It recovers a truncated strand, not
 * an unknown one.
 */
async function fetchEventsFromKnownOrganizers(
  knownVenueEvents,
  seenIds,
  isAtKnownVenue,
) {
  const organizerIds = [
    ...new Set(
      knownVenueEvents
        .map(({ primary_organizer_id: id }) => id)
        .filter((id) => !!id),
    ),
  ];

  console.log(
    ` - Requesting calendars for ${organizerIds.length} organiser(s) at known venues...`,
  );

  const fromDate = format(new Date(), "yyyy-MM-dd");
  const found = [];

  for (const [index, organizerId] of organizerIds.entries()) {
    if (index % 10 === 0)
      console.log(
        `    - ${Math.round((index / organizerIds.length) * 100)}% complete`,
      );

    for (const event of await fetchOrganizerEvents(organizerId, fromDate)) {
      // The organiser's other venues are not our business, and an event the
      // search already gave us arrives richer than this one. The title is
      // checked before the venue because it costs nothing, where matching a
      // venue walks every cinema we hold.
      if (seenIds.has(event.id)) continue;
      if (!hasFilmShapedTitle(event)) continue;
      if (!isAtKnownVenue(event)) continue;
      seenIds.add(event.id);
      found.push(event);
    }
  }

  console.log(
    ` - Found ${found.length} event(s) at known venues that the search did not reach`,
  );

  return found;
}

async function retrieve() {
  console.log(" - Requesting search results pages...");
  const movieListPages = []
    .concat(await getSearchResultsFor("screening"))
    .concat(await getSearchResultsFor("film-and-media--events")); // This is a specific category

  const searchEvents = uniqueEvents(
    movieListPages.flatMap(({ search_data: { events } }) => events.results),
  );

  const isAtKnownVenue = buildKnownVenueTest();
  const knownVenueEvents = searchEvents.filter(isAtKnownVenue);
  console.log(
    ` - ${knownVenueEvents.length} of ${searchEvents.length} events are at a venue we hold`,
  );

  const organizerListings = await fetchEventsFromKnownOrganizers(
    knownVenueEvents,
    new Set(searchEvents.map(({ id }) => id)),
    isAtKnownVenue,
  );

  // Only events at a venue we hold get their page fetched. find-events reads
  // pages for exactly these events and discards the rest, and discover-venues
  // works off the search listings rather than the pages, so a venue we don't
  // hold yet is still reported without our paying a request per event for it.
  // The same call feverup's retrieve makes when it spends its session requests
  // only on plans held at a venue it knows.
  const eventsNeedingPages = knownVenueEvents.concat(organizerListings);

  console.log(
    ` - Requesting details for ${eventsNeedingPages.length} events...`,
  );
  const moviePages = {};
  const unreachable = [];

  const fetchEventPage = async (event) => {
    moviePages[event.url] = await getPageServerData(
      `eventbrite-event-${event.id}`,
      event.url,
      EVENT_REQUEST_DELAY_MS,
      EVENT_RETRY_CONFIG,
    );
  };

  // Sort a failure into "the event is gone" (drop it) or "we couldn't reach it"
  // (collect it). Conflating the two is how a flaky network quietly ships a
  // thinner dataset: a connection error says nothing about whether the event
  // exists, so pushing it onto `collected` keeps it in play for another go.
  const collectUnreachable = (error, event, collected) => {
    // A block that survived its retries means we're throttled, not that the
    // event is gone. Fail loudly so the job errors (and the next retry resumes
    // from cache) rather than silently shipping partial data.
    if (error.status === 429) throw error;
    // A 404 is definitive: the organiser removed the event, but the search
    // index still lists it. Some linger for weeks, so this is expected noise.
    if (error.status === 404) {
      console.log(`! Skipping removed event at ${event.url}`);
      return;
    }
    collected.push(event);
  };

  for (const [index, event] of eventsNeedingPages.entries()) {
    try {
      if (index % 10 === 0)
        console.log(
          `    - ${Math.round((index / eventsNeedingPages.length) * 100)}% complete`,
        );
      await fetchEventPage(event);
    } catch (e) {
      collectUnreachable(e, event, unreachable);
    }
  }

  // Retry the unreachable events once the main loop is done. Retrying inline is
  // the wrong shape for these: whatever causes them lasts longer than any
  // sensible inline budget, so the inline retries all fail inside the same bad
  // window. By the time the loop ends the run has moved on by many minutes and
  // the condition has almost always cleared - on run 32495277530 every event a
  // failing attempt dropped this way was fetched fine by the following attempt,
  // purely because that attempt came later. This sweep gives the run that
  // *succeeds* the same second chance, instead of only the ones that fail.
  if (unreachable.length > 0) {
    console.log(
      ` - Retrying ${unreachable.length} unreachable event${unreachable.length === 1 ? "" : "s"}...`,
    );
    const stillUnreachable = [];
    for (const [index, event] of unreachable.entries()) {
      try {
        // Each of these can spend its full inline budget before failing, so
        // name them one by one rather than going quiet again.
        console.log(
          `    - ${index + 1} of ${unreachable.length}: ${event.url}`,
        );
        await fetchEventPage(event);
      } catch (e) {
        collectUnreachable(e, event, stillUnreachable);
      }
    }

    if (stillUnreachable.length > 0) {
      throw new Error(
        `Could not reach ${stillUnreachable.length} event page(s) after a deferred retry, ` +
          `so the data would be incomplete: ${stillUnreachable
            .map(({ url }) => url)
            .join(", ")}`,
      );
    }
  }

  // An organiser listing is too thin to publish on its own, so it is completed
  // from the page fetched above. A removed event has no page to complete it
  // with - the 404 above already said so - and is dropped here rather than
  // shipped with no date.
  const organizerEvents = organizerListings
    .filter(({ url }) => !!moviePages[url])
    .map((event) => normalizeOrganizerEvent(event, moviePages[event.url]));

  return { movieListPages, moviePages, organizerEvents };
}

module.exports = retrieve;
