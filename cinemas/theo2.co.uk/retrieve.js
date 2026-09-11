const cheerio = require("cheerio");
const getPageWithPlaywright = require("../../common/get-page-with-playwright");
const attributes = require("./attributes");

// The narrowest filter the feed offers that still holds the screenings - the
// rest of the estate is split by music genre, sport and family.
const ENTERTAINMENT_CATEGORY = 1;

// `per_page` is capped server-side at 24: asking for 100 returns 24 with nothing
// to say anything was left behind, so page through rather than ask for one lot.
const EVENTS_PER_PAGE = 24;

// Backstop so a feed that never returns an empty page can't spin forever.
const MAX_PAGES = 40;

const getListingPath = (offset) =>
  `/events/events_ajax/${offset}?category=${ENTERTAINMENT_CATEGORY}&venue=0&team=0&per_page=${EVENTS_PER_PAGE}`;

// The WAF answers anything that isn't a real browser with a bare 406, detail
// pages included. Navigating to the endpoint doesn't work either: it replies
// `text/html`, so the browser parses the HTML held *inside* the JSON string and
// the source is lost. Only a fetch from page context returns the body intact.
async function fetchFromPage(page, url) {
  const { ok, status, body } = await page.evaluate(async (target) => {
    const response = await fetch(target, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    return {
      ok: response.ok,
      status: response.status,
      body: await response.text(),
    };
  }, url);

  if (!ok) {
    throw new Error(`Request for ${url} failed with status ${status}`);
  }

  return body;
}

// The fragment arrives as a JSON-encoded string. A body that isn't JSON means
// the endpoint changed shape, or the WAF answered instead of the app.
function parseListingResponse(body, url) {
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(
      `Expected a JSON-encoded HTML fragment from ${url}, got: ${body.slice(0, 200)}`,
    );
  }
}

async function retrieve() {
  return getPageWithPlaywright(attributes.url, attributes.id, async (page) => {
    await page.waitForLoadState();

    const movieListPages = [];
    const moviePageUrls = new Set();
    let exhausted = false;

    for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber += 1) {
      const listingPath = getListingPath(pageNumber * EVENTS_PER_PAGE);
      const listPage = parseListingResponse(
        await fetchFromPage(page, listingPath),
        listingPath,
      );

      const $ = cheerio.load(listPage);
      const events = $(".eventItem");

      if (events.length === 0) {
        exhausted = true;
        break;
      }

      movieListPages.push(listPage);
      events.each((_, element) => {
        const url = $(element).find("h3.title a").attr("href");
        if (url) moviePageUrls.add(url);
      });
    }

    if (!exhausted) {
      throw new Error(
        `Still finding events after ${MAX_PAGES} pages - the listing feed is not terminating`,
      );
    }

    // Whether any of these is a film is `transform`'s question, and the answer
    // is often none. The feed itself must never be empty: The O2 always has
    // something on.
    if (moviePageUrls.size === 0) {
      throw new Error(
        "No events found in the Entertainment listing - the events feed may have changed",
      );
    }

    const moviePages = {};
    for (const moviePageUrl of moviePageUrls) {
      moviePages[moviePageUrl] = await fetchFromPage(page, moviePageUrl);
    }

    return { movieListPages, moviePages };
  });
}

module.exports = retrieve;
