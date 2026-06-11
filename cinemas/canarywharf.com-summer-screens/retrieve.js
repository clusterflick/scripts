const getPageWithPlaywright = require("../../common/get-page-with-playwright");
const { id, url } = require("./attributes");

async function retrieve() {
  const movieListPage = await getPageWithPlaywright(url, id, async (page) => {
    await page.waitForLoadState("networkidle");
    return page.content();
  });

  return { movieListPage };
}

module.exports = retrieve;
