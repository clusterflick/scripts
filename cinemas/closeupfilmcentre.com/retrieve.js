const cheerio = require("cheerio");
const { withCamoufoxSession } = require("../../common/get-page-with-camoufox");
const {
  BOT_CHALLENGE_TEXT,
  isBotChallengeResponse,
  isBotChallengeFetchResponse,
} = require("../../common/bot-challenge");
const { fetchWithRetry } = require("../../common/utils");
const { getCacheKey } = require("./utils");
const { domain } = require("./attributes");

// The site sits behind a Cloudflare Managed Challenge that flips on and off on
// roughly a half-hour cycle. When it's off, a plain request gets the real page;
// when it's on, only Camoufox solves it. So each page is tried cheaply first and
// the session escalates to the browser at the first challenge - see
// `withoutBrowser` in `common/get-page-with-camoufox.js`.
const MOVIE_LIST_PAGE_URL = `${domain}/search_film_programmes/`;

// Each page type has a selector that only the real page carries, so a challenge
// interstitial served with a 200 can't be mistaken for content. It's what the
// browser waits for too: on a challenged navigation the first response is
// Cloudflare's interstitial and the real document only replaces it once
// Camoufox has solved the challenge.
const MOVIE_LIST_PAGE_SELECTOR = ".inner_block_3 a";
const MOVIE_PAGE_SELECTOR = "#film_program_support";

// Returns the page HTML, or null when the request was challenged - which tells
// the session to escalate to the browser. Anything else (a 500, a connection
// failure) throws, because escalating wouldn't help and a quiet failure here
// would look identical to a venue that has stopped listing films.
const fetchWithoutBrowser = (selector) => async (url) => {
  const response = await fetchWithRetry(url);
  if (isBotChallengeFetchResponse(response)) return null;

  const html = await response.text();
  if (!response.ok) {
    // Cloudflare has served challenge pages under other statuses; fall back to
    // the page copy before deciding this is a genuine server error.
    if (BOT_CHALLENGE_TEXT.test(html)) return null;
    throw new Error(`Unexpected ${response.status} response for ${url}`);
  }
  // A challenge rendered under a 200 without the usual copy still can't carry
  // the selector, so treat a selector-less page as challenged and let the
  // browser attempt settle it either way.
  return cheerio.load(html)(selector).length > 0 ? html : null;
};

const readPageWithBrowser = (selector) => async (page, response) => {
  if (isBotChallengeResponse(response)) {
    console.log("      - Challenge served; waiting for Camoufox to solve it");
  }
  await page.waitForSelector(selector);
  return page.content();
};

const getPageContent = (getPage, url, selector) =>
  getPage(url, getCacheKey(url), readPageWithBrowser(selector), {
    withoutBrowser: fetchWithoutBrowser(selector),
  });

async function retrieve() {
  return withCamoufoxSession(async (getPage) => {
    const movieListPage = await getPageContent(
      getPage,
      MOVIE_LIST_PAGE_URL,
      MOVIE_LIST_PAGE_SELECTOR,
    );

    const $ = cheerio.load(movieListPage);
    const moviePageUrls = new Set();
    $(MOVIE_LIST_PAGE_SELECTOR).each(function () {
      moviePageUrls.add($(this).attr("href"));
    });

    if (moviePageUrls.size === 0) {
      throw new Error(
        "No film programmes found - the page structure may have changed",
      );
    }

    // Every film page must be retrieved: a partial programme would silently
    // delist whatever the run didn't reach, so a failure here fails the run.
    const moviePages = {};
    for (const moviePageUrl of moviePageUrls) {
      moviePages[moviePageUrl] = await getPageContent(
        getPage,
        moviePageUrl,
        MOVIE_PAGE_SELECTOR,
      );
    }

    return { movieListPage, moviePages };
  });
}

module.exports = retrieve;
