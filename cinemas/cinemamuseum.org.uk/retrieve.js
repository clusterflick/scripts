const cheerio = require("cheerio");
const slugify = require("slugify");
const getPageWithPlaywright = require("../../common/get-page-with-playwright");
const { sleep, withJitter } = require("../../common/utils");
const { domain } = require("./attributes");

// Safety cap on pagination - the events list runs to around five pages, so this
// should never be reached. Throw if it is rather than paging on until the site
// challenges the crawl, which is what a page the site answers with a listing it
// has already served looks like.
const MAX_PAGES = 25;

// The site is on SiteGround, which on 22nd October 2026 started challenging the
// runner part-way through the crawl. The browser clears the first challenge,
// but a second one seconds later escalates to an image captcha that nothing
// clears - so it is the crawl's pace being challenged, pages arriving back to
// back, not the browser. Spacing them out, jittered so they don't land at
// robotically exact intervals, keeps it looking less like one. The pause sits
// inside the cache callbacks below, after the page is read, so it only slows a
// page actually fetched, never a cache hit.
const REQUEST_DELAY_MS = 5_000;
const pace = () => sleep(withJitter(REQUEST_DELAY_MS));

async function retrieve() {
  let page = 1;
  const moviePageUrls = new Set();

  while (page <= MAX_PAGES) {
    const movieListPageUrl = `${domain}/schedule/category/events/page/${page}/`;
    const cacheKey = `cinemamuseum-page-${page}`;
    const movieListPage = await getPageWithPlaywright(
      movieListPageUrl,
      cacheKey,
      async (page) => {
        await page.waitForLoadState();
        await page
          .locator(".tribe-events-header__title-text")
          .waitFor({ strict: false });
        const content = await page.content();
        await pace();
        return content;
      },
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

    page += 1;
    $entries.each(function () {
      const url = $(this)
        .find("a.tribe-events-calendar-list__event-title-link")
        .attr("href");
      moviePageUrls.add(url);
    });
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
    moviePages[moviePageUrl] = await getPageWithPlaywright(
      moviePageUrl,
      cacheKey,
      async (page) => {
        await page.waitForLoadState();
        await page.locator("#tribe-events-content").waitFor({ strict: false });
        const content = await page.content();
        await pace();
        return content;
      },
    );
  }

  return { moviePages };
}

module.exports = retrieve;
