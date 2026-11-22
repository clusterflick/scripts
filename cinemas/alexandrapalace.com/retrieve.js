const cheerio = require("cheerio");
const {
  withPlaywrightSession,
} = require("../../common/get-page-with-playwright");
const { id, url } = require("./attributes");

// Alexandra Palace tags its listings by space rather than by art form: the
// "Film" tag exists in the site's tag cloud but nothing currently carries it,
// including the venue's actual film events. So there is no film listing to
// fetch - this takes the theatre's whole what's-on and leaves categorisation
// to sort films from the comedy and music around them.

const EVENT_LINK_SELECTOR = ".event_card a.event_target";

// Only an event page carries the WordPress REST link the transform reads the
// event id from, so a challenge interstitial or a block page can't satisfy it.
const EVENT_PAGE_SELECTOR = 'link[rel="alternate"][type="application/json"]';

// Through a browser rather than `fetchText`. In November 2026 Cloudflare began
// answering a plain request from GitHub's runners with a managed challenge,
// whatever its headers, while the stealth Chromium got the page. The
// self-hosted runners fare worse: the site's host blocks their whole network
// ("Requests from your network were blocked across our hosting platform"),
// and no client gets past that, which is why the venue runs on GitHub's.
//
// Each wait is on a selector only the real page has: a challenge is replaced
// by the page once it clears, and one that doesn't clear times out rather
// than being read as a venue with nothing on.
const getEventSlug = (eventUrl) =>
  new URL(eventUrl).pathname.split("/").filter(Boolean).pop();

async function retrieve() {
  return withPlaywrightSession(async (getPage) => {
    const movieListPage = await getPage(url, `${id}-whats-on`, async (page) => {
      await page.waitForSelector(EVENT_LINK_SELECTOR, { state: "attached" });
      return page.content();
    });

    const $ = cheerio.load(movieListPage);
    const moviePageUrls = new Set();
    $(EVENT_LINK_SELECTOR).each(function () {
      const href = $(this).attr("href");
      if (href) moviePageUrls.add(href);
    });

    const moviePages = {};
    for (const moviePageUrl of moviePageUrls) {
      moviePages[moviePageUrl] = await getPage(
        moviePageUrl,
        `${id}-event-${getEventSlug(moviePageUrl)}`,
        async (page) => {
          await page.waitForSelector(EVENT_PAGE_SELECTOR, {
            state: "attached",
          });
          return page.content();
        },
      );
    }

    return { movieListPage, moviePages };
  });
}

module.exports = retrieve;
