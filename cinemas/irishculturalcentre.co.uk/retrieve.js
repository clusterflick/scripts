const cheerio = require("cheerio");
const { withCamoufoxSession } = require("../../common/get-page-with-camoufox");
const { getPageEscalating } = require("../../common/camoufox-escalation");
const { assertSelector, sleep, withJitter } = require("../../common/utils");
const { getUndatedEvents, backfillListingDates } = require("./utils");
const { id, url, domain } = require("./attributes");

// The unfiltered listing, read only to backfill dates the film listing is
// missing - see `backfillListingDates` in `./utils.js`.
const FULL_LISTING_URL = `${domain}/whats-on/`;

// The site sits behind a bot check that on 23rd October 2026 began answering
// the runner with a "verifying your connection" page under a 200, which carries
// none of the signals `classifyRefusal` knows. So the listing is tried with a
// plain fetch first and the session escalates to Camoufox when the real page
// doesn't come back - see `common/camoufox-escalation.js`.
//
// The Search & Filter results container is on the listing whether or not
// anything is showing, and a challenge page can't carry it - so it is what
// tells the real page apart, and what the browser waits for while the
// challenge clears. The listing's own cards can't do that job, since a
// listing with nothing on has none.
const PAGE_SELECTOR = ".search-filter-results";

// The "Back to listings" link closes the content column of every event page,
// so it is only there once the page has been parsed past the description the
// transform reads.
const EVENT_PAGE_SELECTOR = ".back-link";

// The event pages follow the listing back to back, the crawl shape that gets
// JW3 re-challenged and got the David Lean Cinema's connections dropped. A
// retrieve on 23rd October 2026 fetched all ten without a second challenge,
// but the bot check only began that day, so they are spaced out, jittered, as
// those venues' are. The pause runs inside the cache callbacks, so it only
// slows a page actually fetched, never a cache hit.
const REQUEST_DELAY_MS = 5_000;
const pace = () => sleep(withJitter(REQUEST_DELAY_MS));

// The full listing is only served from the host's page cache to a navigation:
// a request with `Sec-Fetch-Mode: cors` or `no-cors` is rendered fresh, with
// the dates blank, and Node's `fetch` sends `cors` on every request and won't
// let it be changed. Measured on 9th November 2026: curl and a browser got the
// cached copy, `fetchWithRetry` the fresh one. So it is read through the
// session's browser, never `getPageEscalating`'s plain fetch.
//
// The backfill runs inside the callback, so a full listing that can't date
// every film throws before it is cached and a retry fetches it again.
const readFullListing = (listingPage) => async (page) => {
  await page.waitForSelector(PAGE_SELECTOR, { state: "attached" });
  await page.waitForLoadState("load");
  const content = await page.content();
  backfillListingDates(listingPage, content);
  await pace();
  return content;
};

// The listing card only carries an excerpt of the event's description, which
// can stop before anything that tells one same-titled film from another - All
// That Glitters' card never mentions the Shakespeare plot TheMovieDB describes.
// So each event page is fetched for the full description.
async function retrieveListing(getPage) {
  const listingPage = await getPageEscalating(getPage, url, `${id}-listing`, {
    selector: PAGE_SELECTOR,
  });
  assertSelector(listingPage, ".project-post");

  let movieListPage = listingPage;
  const undated = getUndatedEvents(listingPage);
  if (undated.length > 0) {
    console.log(
      `      - ${undated.length} event(s) listed without a date; backfilling from ${FULL_LISTING_URL}`,
    );
    const fullListingPage = await getPage(
      FULL_LISTING_URL,
      `${id}-full-listing`,
      readFullListing(listingPage),
    );
    movieListPage = backfillListingDates(listingPage, fullListingPage);
  }

  const $ = cheerio.load(movieListPage);
  const eventUrls = $(".project-post a.project-link")
    .map((_, element) => $(element).attr("href"))
    .get();

  const eventPages = {};
  for (const eventUrl of new Set(eventUrls)) {
    const slug = new URL(eventUrl).pathname.split("/").filter(Boolean).pop();
    eventPages[eventUrl] = await getPageEscalating(
      getPage,
      eventUrl,
      `${id}-event-${slug}`,
      { selector: EVENT_PAGE_SELECTOR, pace },
    );
  }

  return { movieListPage, eventPages };
}

const retrieve = () => withCamoufoxSession(retrieveListing);

module.exports = retrieve;
