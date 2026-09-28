const cheerio = require("cheerio");
const {
  withPlaywrightSession,
} = require("../../common/get-page-with-playwright");
const { loadShowInto } = require("../../common/bfi.org.uk/load-shows");
const { jitteredDelay } = require("../../common/bfi.org.uk/request-delay");
const { sleep } = require("../../common/utils");

// Festivals are opted in while their programme is on sale, and taken out again
// once it has finished - a festival's site stays up all year, and retrieving a
// finished programme costs a few hundred paced page loads for nothing.
//
// Each festival site works like BFI Southbank's: an index page lists the films,
// but it's curated and leaves things out - at the 2026 London Film Festival, the
// relaxed screenings, Screen Talks and free events - so the festival's day
// pages, which list every screening on sale that day, fill the gaps. The index
// is linked from the site's "Films and events" menu by a script rather than an
// href, which is easy to miss when looking for it: find it and set it here
// rather than concluding a festival has none.
const FESTIVALS = [
  {
    id: "lff",
    name: "BFI London Film Festival",
    note: "Part of the BFI London Film Festival",
    domain: "https://whatson.bfi.org.uk/lff/Online/",
    indexPermalink: "films-az",
  },
];

// Indices within each articleContext.searchResults entry (see find-events.js)
const RESULT_TITLE = 5;
const RESULT_KEYWORDS = 17;
const RESULT_BOOKING_URL = 18;

const getPermalinkPath = (permalink) =>
  `default.asp?BOparam::WScontent::loadArticle::permalink=${permalink}`;

async function getListingPage(getPage, festival, permalink, callback) {
  return getPage(
    `${festival.domain}${getPermalinkPath(permalink)}`,
    `bfi.org.uk-bfi-festivals-${festival.id}-${permalink}`,
    async (page) => {
      await sleep(jitteredDelay());
      await page.waitForLoadState("domcontentloaded");
      await page.locator(".main-article-body").waitFor({ state: "attached" });
      return callback(page);
    },
  );
}

/**
 * The films the festival's index page links to. A short film links to the
 * programme it screens in, so several links can share one article.
 */
async function getIndexShows(getPage, festival) {
  const html = await getListingPage(
    getPage,
    festival,
    festival.indexPermalink,
    (page) => page.content(),
  );

  const $ = cheerio.load(html);
  const shows = new Map();
  $(".main-article-body .Rich-text li > a").each(function () {
    const showUrl = $(this).attr("href");
    if (showUrl && !shows.has(showUrl)) {
      shows.set(showUrl, { showUrl, title: $(this).text().trim() });
    }
  });
  if (shows.size === 0) {
    throw new Error(
      `No films listed on the ${festival.name} index page - the page structure may have changed`,
    );
  }

  return { html, shows: [...shows.values()] };
}

/**
 * Every screening on sale across the festival, from its day pages. The days are
 * linked from the festival's home page by their date permalink.
 */
async function getDayShows(getPage, festival) {
  const homePage = await getPage(
    festival.domain,
    `bfi.org.uk-bfi-festivals-${festival.id}-home`,
    async (page) => {
      await sleep(jitteredDelay());
      await page.waitForLoadState("domcontentloaded");
      await page.locator("#content").waitFor({ state: "attached" });
      return page.content();
    },
  );

  const $ = cheerio.load(homePage);
  const dayPermalinks = new Set();
  $("a").each(function () {
    const href = $(this).attr("href") || "";
    const match = href.match(/loadArticle::permalink=(\d{8})$/);
    if (match) dayPermalinks.add(match[1]);
  });
  if (dayPermalinks.size === 0) {
    throw new Error(
      `No festival days linked from the ${festival.name} home page - the page structure may have changed`,
    );
  }

  const days = {};
  const shows = new Map();
  for (const permalink of [...dayPermalinks].sort()) {
    console.log(`    - Getting screenings for ${festival.name} ${permalink}`);
    const searchResults = await getListingPage(
      getPage,
      festival,
      permalink,
      (page) =>
        // eslint-disable-next-line no-undef
        page.evaluate(() => window.articleContext?.searchResults ?? null),
    );
    if (!Array.isArray(searchResults)) {
      throw new Error(
        `No screenings data found on the ${festival.name} page for ${permalink}`,
      );
    }
    days[permalink] = searchResults;

    for (const result of searchResults) {
      const title = result[RESULT_TITLE];
      const bookingUrl = result[RESULT_BOOKING_URL];
      // A cancelled screening stays listed, retitled, with its booking link
      // taken away. There is nothing to book, so there is nothing to retrieve.
      if (!bookingUrl && /^cancelled\b/i.test(title)) continue;
      // A gala's fundraising ticket is a pricier way into the gala screening,
      // listed as an article of its own and timed for arrival - the screening
      // is already listed under the film.
      if (/\bfundraising ticket\b/i.test(result[RESULT_KEYWORDS])) continue;

      // The booking link names the film's article, and the screening in it
      const showUrl = bookingUrl.split(
        "&BOparam::WScontent::loadArticle::context_id=",
      )[0];
      const articleId = showUrl.match(
        /loadArticle::article_id=([0-9A-F-]+)/i,
      )?.[1];
      if (!articleId) {
        throw new Error(
          `No article id in the booking link for "${title}" on ${festival.name} ${permalink}`,
        );
      }
      if (!shows.has(articleId)) {
        shows.set(articleId, { showUrl, title, articleId });
      }
    }
  }

  return { homePage, days, shows: [...shows.values()] };
}

async function retrieveFestival(getPage, festival) {
  const attributes = {
    url: `${festival.domain}default.asp`,
    domain: festival.domain,
    articleId: festival.id,
  };
  const moviePages = {};
  const loadedIds = new Set();

  console.log(`    - Retrieving index page for ${festival.name} ...`);
  const index = await getIndexShows(getPage, festival);
  console.log(`    - Loading ${index.shows.length} index show pages ...`);
  for (const show of index.shows) {
    await loadShowInto(
      getPage,
      attributes,
      show,
      moviePages,
      loadedIds,
      jitteredDelay(),
    );
  }

  console.log(`    - Retrieving day pages for ${festival.name} ...`);
  const days = await getDayShows(getPage, festival);
  const gaps = days.shows.filter(
    ({ articleId }) => !loadedIds.has(articleId.toUpperCase()),
  );
  console.log(`    - Gap-filling ${gaps.length} day-only show pages ...`);
  for (const show of gaps) {
    await loadShowInto(
      getPage,
      attributes,
      show,
      moviePages,
      loadedIds,
      jitteredDelay(),
    );
  }

  return {
    movieListPage: {
      indexPage: index.html,
      homePage: days.homePage,
      days: days.days,
    },
    moviePages,
  };
}

async function retrieve() {
  // Share one browser across the whole run, as BFI Southbank does, to reuse
  // cookies and skip per-page launch and teardown
  return withPlaywrightSession(async (getPage) => {
    const movieListPages = {};
    const moviePages = {};

    for (const festival of FESTIVALS) {
      const festivalData = await retrieveFestival(getPage, festival);
      movieListPages[festival.id] = festivalData.movieListPage;
      for (const [showPath, moviePage] of Object.entries(
        festivalData.moviePages,
      )) {
        moviePages[`${festival.domain}${showPath}`] = {
          ...moviePage,
          domain: festival.domain,
          festival: festival.name,
          note: festival.note,
        };
      }
    }

    return { movieListPages, moviePages };
  });
}

module.exports = retrieve;
