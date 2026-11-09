const {
  withPlaywrightSession,
} = require("../../common/get-page-with-playwright");
const { getExpectedClosure } = require("../../common/expected-closures");
const { id, url } = require("./attributes");
const { getEventUrl, getListedEvents, isFilmTitle } = require("./utils");

// Through a browser rather than `fetchText`, though the pages are rendered on
// the server: every response sets ~18KB of cookies, over Node's 16KB header
// limit, so `fetch` fails with UND_ERR_HEADERS_OVERFLOW before reading a byte.
const retrievePages = () =>
  withPlaywrightSession(async (getPage) => {
    const listingPage = await getPage(url, `${id}-whats-on`, async (page) => {
      const content = await page.content();
      // Every listing has something on - markets, yoga, the pub quiz - so an
      // empty grid is a page that has changed shape, not a quiet week.
      if (getListedEvents(content).length === 0) {
        throw new Error("No events found on the what's on page");
      }
      return content;
    });

    const eventPages = {};
    for (const { eventNo, title } of getListedEvents(listingPage)) {
      if (!isFilmTitle(title)) continue;
      const eventUrl = getEventUrl(eventNo);
      eventPages[eventUrl] = await getPage(
        eventUrl,
        `${id}-event-${eventNo}`,
        async (page) => {
          // The event's details sit in this section, so its absence means we
          // landed somewhere other than an event page.
          await page.locator(".fpr-section-eventdetail h1").waitFor();
          return page.content();
        },
      );
    }

    return { eventPages };
  });

async function retrieve() {
  try {
    return await retrievePages();
  } catch (error) {
    // The first venue to stand down at retrieve rather than at transform, and
    // it has to be here: the closure this rides on is a dead domain, so the
    // navigation fails and there is no retrieved data for a transform to find
    // empty. Everything the declared closure is meant to excuse fails at this
    // one call, so the whole retrieve is what stands down.
    //
    // Deliberately not narrowed to the DNS error. Whether the zone comes back
    // pointing at nothing, a holding page or a rebuilt site, the answer for
    // today is the same, and matching on Playwright's error text would only
    // decide which shape of the same outage gets through. The window is a
    // single day and the swallowed error is logged in full, so nothing hides
    // here for longer than one run.
    const closure = getExpectedClosure(id);
    if (!closure) throw error;

    console.log(
      `      - ⚠️  Unable to retrieve ${id} - closed until ${closure.until} for ${closure.reason}: ${error.message}`,
    );
    return { eventPages: {} };
  }
}

module.exports = retrieve;
