const getPageWithPlaywright = require("../../common/get-page-with-playwright");
const { id, url } = require("./attributes");

async function retrieve() {
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
}

module.exports = retrieve;
