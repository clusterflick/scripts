const cheerio = require("cheerio");
const getPageWithPlaywright = require("../../common/get-page-with-playwright");
const discoverCalendarShows = require("../../common/bfi.org.uk/discover-calendar");
const { loadShowInto } = require("../../common/bfi.org.uk/load-shows");
const { getText, getId } = require("../../common/utils");
const attributes = require("./attributes");

const { url, articleId } = attributes;

// Southbank discovers shows from TWO complementary sources and unions them:
//  - the films index: one page listing every current article, with working
//    canonical links (recovers films whose calendar links are broken), but
//    curated so it omits some variants/polls/sessions;
//  - the calendar search: broad, finds the articles the index omits, but points
//    at some broken links.
// The index is loaded first (establishing the set of article ids we have), then
// the calendar is used to gap-fill only the articles the index didn't cover.
const FILMS_INDEX_URL = `${url}?BOparam::WScontent::loadArticle::permalink=filmsindex`;

// Pace show-page fetches to stay under BFI's request throttle, which otherwise
// slams roughly every 7th rapid request with a ~2min penalty. Measured floor:
// 5s still trips it, 8s is clear - so keep spacing at ~7s+.
// A fixed interval is itself a detectable signature, so jitter each wait across
// a band centred on 10s (8s-12s) - keeps the known-clear 8s floor while
// breaking up the regular cadence.
const REQUEST_DELAY_MIN_MS = 8000;
const REQUEST_DELAY_MAX_MS = 12000;
const jitteredDelay = () =>
  REQUEST_DELAY_MIN_MS +
  Math.floor(Math.random() * (REQUEST_DELAY_MAX_MS - REQUEST_DELAY_MIN_MS + 1));

async function getFilmsIndex() {
  // Distinct from the calendar search's cache key (which also keys on the venue
  // articleId) so the two don't clobber each other.
  const cacheKey = `bfi.org.uk-${getId(FILMS_INDEX_URL)}-${articleId}`;
  return getPageWithPlaywright(url, cacheKey, async (page) => {
    await page.waitForLoadState("domcontentloaded");
    await page.goto(FILMS_INDEX_URL);
    try {
      await page.waitForLoadState("networkidle");
    } catch {
      // Timed out - keep going and let the content wait below decide.
    }
    await page
      .locator(".main-article-body .Rich-text")
      .first()
      .waitFor({ state: "attached" });
    return page.content();
  });
}

// The films index lists each article as a `.Rich-text ul li a` with an
// `article/{slug}` permalink. Other links on the page (breadcrumbs, the
// 16/35/70mm strand) sit outside that list and are excluded by this selector.
// The article id isn't known until the page is loaded, so it's absent here.
function discoverIndexShows(filmsIndexPage) {
  const $ = cheerio.load(filmsIndexPage);
  const shows = [];
  $(".main-article-body .Rich-text ul li a").each(function () {
    const href = $(this).attr("href");
    if (!href || !href.startsWith("article/")) return;
    shows.push({ showUrl: href, title: getText($(this)) });
  });
  return shows;
}

async function retrieve() {
  const moviePages = {};
  const loadedIds = new Set();

  // 1. Films index - load every listed article.
  console.log("");
  console.log(`    - [${Date.now()}] Retrieving films index ... `);
  const filmsIndexPage = await getFilmsIndex();
  const indexShows = discoverIndexShows(filmsIndexPage);
  console.log(
    `    - [${Date.now()}] Loading ${indexShows.length} index show pages ... `,
  );
  for (const show of indexShows) {
    await loadShowInto(
      attributes,
      show,
      moviePages,
      loadedIds,
      jitteredDelay(),
    );
  }

  // 2. Calendar - gap-fill only the articles the index didn't already cover.
  const { movieListPage, shows: calendarShows } =
    await discoverCalendarShows(attributes);
  const gaps = calendarShows.filter(
    (show) => show.articleId && !loadedIds.has(show.articleId.toUpperCase()),
  );
  console.log(
    `    - [${Date.now()}] Gap-filling ${gaps.length} calendar-only show pages ... `,
  );
  for (const show of gaps) {
    await loadShowInto(
      attributes,
      show,
      moviePages,
      loadedIds,
      jitteredDelay(),
    );
  }

  return { filmsIndexPage, movieListPage, moviePages };
}

module.exports = retrieve;
