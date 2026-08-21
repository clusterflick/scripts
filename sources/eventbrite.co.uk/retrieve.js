const cheerio = require("cheerio");
const { fetchText, sleep, withJitter } = require("../../common/utils.js");
const { dailyCache } = require("../../common/cache.js");
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
  }
  return movieListPages;
};

async function retrieve() {
  console.log(" - Requesting search results pages...");
  const movieListPages = []
    .concat(await getSearchResultsFor("screening"))
    .concat(await getSearchResultsFor("film-and-media--events")); // This is a specific category

  const events = uniqueEvents(
    movieListPages.flatMap(({ search_data: { events } }) => events.results),
  );

  console.log(` - Requesting details for ${events.length} events...`);
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

  for (const [index, event] of events.entries()) {
    try {
      if (index % 10 === 0)
        console.log(
          `    - ${Math.round((index / events.length) * 100)}% complete`,
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
  // the condition has almost always cleared — on run 32495277530 every event a
  // failing attempt dropped this way was fetched fine by the following attempt,
  // purely because that attempt came later. This sweep gives the run that
  // *succeeds* the same second chance, instead of only the ones that fail.
  if (unreachable.length > 0) {
    console.log(` - Retrying ${unreachable.length} unreachable events...`);
    const stillUnreachable = [];
    for (const event of unreachable) {
      try {
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

  return { movieListPages, moviePages };
}

module.exports = retrieve;
