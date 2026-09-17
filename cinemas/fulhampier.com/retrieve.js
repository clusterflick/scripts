const getPageWithPlaywright = require("../../common/get-page-with-playwright");
const { getExpectedClosure } = require("../../common/expected-closures");
const { id, url } = require("./attributes");

async function retrieve() {
  try {
    const eventsData = await getPageWithPlaywright(url, id, async (page) => {
      await page.waitForLoadState();

      // Extract the eventobj variable from the page
      const content = await page.content();
      const match = content.match(/eventobj\s*=\s*(\[.*?\]);/s);

      if (!match) {
        throw new Error("Could not find eventobj data on page");
      }

      return JSON.parse(match[1]);
    });

    return { eventsData };
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
    return { eventsData: [] };
  }
}

module.exports = retrieve;
