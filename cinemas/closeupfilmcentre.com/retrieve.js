const cheerio = require("cheerio");
const { withCamoufoxSession } = require("../../common/get-page-with-camoufox");
const { getPageEscalating } = require("../../common/camoufox-escalation");
const { getCacheKey } = require("./utils");
const { domain } = require("./attributes");

// The site sits behind a Cloudflare Managed Challenge that flips on and off on
// roughly a half-hour cycle. When it's off, a plain request gets the real page;
// when it's on, only Camoufox solves it. So each page is tried cheaply first and
// the session escalates to the browser at the first challenge - see
// `common/camoufox-escalation.js`.
const MOVIE_LIST_PAGE_URL = `${domain}/search_film_programmes/`;

// Each page type has a selector that only the real page carries, so a challenge
// interstitial served with a 200 can't be mistaken for content.
const MOVIE_LIST_PAGE_SELECTOR = ".inner_block_3 a";
const MOVIE_PAGE_SELECTOR = "#film_program_support";

const getPageContent = (getPage, url, selector) =>
  getPageEscalating(getPage, url, getCacheKey(url), { selector });

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
