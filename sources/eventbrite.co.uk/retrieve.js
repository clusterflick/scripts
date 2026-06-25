const cheerio = require("cheerio");
const { fetchText, sleep } = require("../../common/utils.js");
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
// Eventbrite's actual threshold is unknown; this is deliberately conservative
// since a slower unattended run is far cheaper than a rate-limited failure, and
// the retry/backoff above is the real safety net if we do clip the limit.
const REQUEST_DELAY_MS = 500;

const getPageServerData = async (url) => {
  const html = await fetchText(url, undefined, RETRY_CONFIG);
  const serverDataMatch = html.match(/\s+window.__SERVER_DATA__ = ({.+});/i);
  if (serverDataMatch) {
    // Remove tabs from string the JSON parser throws on
    return JSON.parse(serverDataMatch[1].replace(/\t/g, " "));
  }

  const $ = cheerio.load(html);
  return JSON.parse($("#__NEXT_DATA__").html());
};

const getSearchResultsFor = async (searchTerm) => {
  const movieListPages = [];
  let page = 1;
  let lastPage = 1;
  while (page <= lastPage) {
    if (page > 1) await sleep(REQUEST_DELAY_MS);
    const url = `${attributes.url}/${searchTerm}/?page=${page}`;
    const pageData = await getPageServerData(url);

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
      if (index > 0) await sleep(REQUEST_DELAY_MS);
      if (index % 10 === 0)
        console.log(
          `    - ${Math.round((index / events.length) * 100)}% complete`,
        );
      const eventData = await getPageServerData(event.url);
      moviePages[event.url] = eventData;
    } catch (e) {
      // Event may have been removed
      console.log(`! Error retriving page data at ${event.url} - ${e.message}`);
    }
  }

  return { movieListPages, moviePages };
}

module.exports = retrieve;
