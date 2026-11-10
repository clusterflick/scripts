const cheerio = require("cheerio");
const { withCamoufoxSession } = require("../../common/get-page-with-camoufox");
const { getPageEscalating } = require("../../common/camoufox-escalation");
const { assertSelector, sleep, withJitter } = require("../../common/utils");
const { id, url } = require("./attributes");

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

// The listing card only carries an excerpt of the event's description, which
// can stop before anything that tells one same-titled film from another - All
// That Glitters' card never mentions the Shakespeare plot TheMovieDB describes.
// So each event page is fetched for the full description.
async function retrieveListing(getPage) {
  const movieListPage = await getPageEscalating(getPage, url, `${id}-listing`, {
    selector: PAGE_SELECTOR,
  });
  assertSelector(movieListPage, ".project-post");

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
