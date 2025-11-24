const getPageWithPlaywright = require("../../common/get-page-with-playwright");
const { id } = require("./attributes");

async function retrieve() {
  const url =
    "https://tickets.lost.org/all-tickets/lost/?ref=website_widget&srch=cinema&show_sort=true&widget=true&minimal=true&show_logo=false&bg_fill=false&disable-widget=true";
  const movieListPage = await getPageWithPlaywright(url, id, async (page) => {
    await page.waitForLoadState();
    await page
      .locator("#tt-checkout--accessibility--main-content")
      .waitFor({ strict: false });
    return await page.content();
  });

  return { movieListPage };
}

module.exports = retrieve;
