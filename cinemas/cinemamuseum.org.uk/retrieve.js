const cheerio = require("cheerio");
const slugify = require("slugify");
const { withCamoufoxSession } = require("../../common/get-page-with-camoufox");
const { getPageEscalating } = require("../../common/camoufox-escalation");
const { sleep, withJitter } = require("../../common/utils");
const { domain } = require("./attributes");

// Safety cap on pagination - the events list runs to around five pages, so this
// should never be reached. Throw if it is rather than paging on until the site
// challenges the crawl, which is what a page the site answers with a listing it
// has already served looks like.
const MAX_PAGES = 25;

// The site is on SiteGround, which on 22nd October 2026 started challenging the
// runner part-way through the crawl. Stealth Chromium cleared the first
// challenge, but a second one seconds later escalated to an image captcha that
// nothing clears, and spacing the pages out didn't stop it. So each page is
// tried with a plain fetch first and the session escalates to Camoufox at the
// first challenge, as Stanley Arts', also on SiteGround, does - see
// `common/camoufox-escalation.js`.
//
// The pages are still spaced out, jittered so they don't land at robotically
// exact intervals, since it was the crawl arriving back to back that SiteGround
// picked on. The pause only slows a page actually fetched, never a cache hit.
const REQUEST_DELAY_MS = 5_000;
const pace = () => sleep(withJitter(REQUEST_DELAY_MS));

// Each page type has a selector only the real page carries, so SiteGround's
// interstitial - served with a 202 - can't be mistaken for content.
const MOVIE_LIST_PAGE_SELECTOR = ".tribe-events-header__title-text";
const MOVIE_PAGE_SELECTOR = "#tribe-events-content";

const getPageContent = (getPage, url, cacheKey, selector) =>
  getPageEscalating(getPage, url, cacheKey, { selector, pace });

async function retrieveListings(getPage) {
  let page = 1;
  const moviePageUrls = new Set();

  while (page <= MAX_PAGES) {
    const movieListPageUrl = `${domain}/schedule/category/events/page/${page}/`;
    const cacheKey = `cinemamuseum-page-${page}`;
    const movieListPage = await getPageContent(
      getPage,
      movieListPageUrl,
      cacheKey,
      MOVIE_LIST_PAGE_SELECTOR,
    );
    const $ = cheerio.load(movieListPage);
    const $entries = $("ul.tribe-events-calendar-list article");

    // An empty page past the first is the end of the listing. An empty first
    // page is not a venue with nothing on - it is the site serving us something
    // other than its listing, and passing it on as an empty retrieve only
    // defers the failure to transform, past the retry that could clear it.
    if ($entries.length === 0 && page === 1) {
      throw new Error(`No events found on ${movieListPageUrl}`);
    }
    if ($entries.length === 0) break;

    $entries.each(function () {
      const url = $(this)
        .find("a.tribe-events-calendar-list__event-title-link")
        .attr("href");
      moviePageUrls.add(url);
    });

    // The last page says it is the last: its "Next Events" control is a
    // disabled button rather than a link. Stopping there saves asking for a
    // page past the end just to find it empty - one more request for SiteGround
    // to challenge, and the one it was challenging on 22nd October 2026. A page
    // carrying neither is markup we don't recognise, and guessing would either
    // drop the pages after it or page on until the cap.
    if ($("button.tribe-events-c-nav__next[disabled]").length > 0) break;
    if ($("a.tribe-events-c-nav__next[rel='next']").length === 0) {
      throw new Error(
        `No "Next Events" link or disabled button on ${movieListPageUrl}`,
      );
    }
    page += 1;
  }

  if (page > MAX_PAGES) {
    throw new Error(
      "Exceeded maximum page limit — stopping condition may have changed",
    );
  }

  const moviePages = {};
  for (const moviePageUrl of [...moviePageUrls]) {
    const moviePath = moviePageUrl.split("cinemamuseum.org.uk")[1];
    const cacheKey = `cinemamuseum-${slugify(moviePath)}`;
    moviePages[moviePageUrl] = await getPageContent(
      getPage,
      moviePageUrl,
      cacheKey,
      MOVIE_PAGE_SELECTOR,
    );
  }

  return { moviePages };
}

const retrieve = () => withCamoufoxSession(retrieveListings);

module.exports = retrieve;
