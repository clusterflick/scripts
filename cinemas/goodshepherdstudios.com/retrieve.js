const getPageWithPlaywright = require("../../common/get-page-with-playwright");
const { url, id } = require("./attributes");

async function retrieve() {
  const movieListPage = await getPageWithPlaywright(url, id, async (page) => {
    await page.waitForLoadState();
    await page.locator(".events-listing").waitFor({ strict: false });
    return await page.content();
  });

  return { movieListPage };
}

module.exports = retrieve;
