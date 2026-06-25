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

// Eventbrite rate-limits bursts of page requests with 429s. Give each fetch a
// generous retry budget so we back off and ride out the limit (honouring any
// Retry-After header) rather than failing the whole run.
const RETRY_CONFIG = { retries: 5, delayMs: 30_000 };

// Space out requests so we don't provoke the rate limit in the first place.
// Eventbrite's threshold is unknown and the 429 behaves like a temporary IP
// block (it persists across the whole run rather than clearing on the next
// request), so prevention matters more than retrying — be deliberately slow.
// Jittered so we don't hammer at robotically exact intervals. The /d/... search
// listing endpoints rate-limit far more aggressively than individual event
// pages (heavier queries, classic scraper target), so pace them separately:
// search is where the 429s actually bite, details cruise through.
const SEARCH_REQUEST_DELAY_MS = 5_000;
const EVENT_REQUEST_DELAY_MS = 2_000;

// Wrap every page fetch in the daily cache. A successfully-fetched page is
// written to disk keyed by today's date, so when a 429 kills the run partway
// through, the nick-fields/retry rerun replays the pages we already have (no
// network, no delay) and resumes from where it stopped — instead of
// re-hammering the same pages and keeping the rate-limit block hot. The throttle
// lives inside the cached function so it only paces real fetches, not replays.
const getPageServerData = (cacheKey, url, delayMs) =>
  dailyCache(cacheKey, async () => {
    await sleep(withJitter(delayMs));
    const html = await fetchText(url, undefined, RETRY_CONFIG);
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
  for (const [index, event] of events.entries()) {
    try {
      if (index % 10 === 0)
        console.log(
          `    - ${Math.round((index / events.length) * 100)}% complete`,
        );
      const eventData = await getPageServerData(
        `eventbrite-event-${event.id}`,
        event.url,
        EVENT_REQUEST_DELAY_MS,
      );
      moviePages[event.url] = eventData;
    } catch (e) {
      // A 429 that survived all its retries means we're rate-limited, not that
      // the event is gone. Fail loudly so the job errors (and the next retry
      // resumes from cache) rather than silently shipping partial data.
      if (e.status === 429) throw e;
      // Any other error (404/unparseable page) means the event was likely
      // removed — skip it and carry on.
      console.log(`! Error retriving page data at ${event.url} - ${e.message}`);
    }
  }

  return { movieListPages, moviePages };
}

module.exports = retrieve;
