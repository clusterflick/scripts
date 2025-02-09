const getPageWithPlaywright = require("../../common/get-page-with-playwright.js");
const attributes = require("./attributes");

async function retrieve() {
  let page = 1;
  let lastPage = 1;
  const data = [];

  while (page <= lastPage) {
    const cacheKey = `eventbrite.co.uk-london-screening-page-${page}`;
    const pageData = await getPageWithPlaywright(
      `${attributes.url}${page}`,
      cacheKey,
      async (page) => {
        await page.waitForLoadState();
        const data = await page.evaluate(
          () => /* global window */ window.__SERVER_DATA__,
        );
        if (!data) throw new Error(`Data not available, "${data}"`);
        return data;
      },
    );

    page += 1;
    lastPage = pageData.page_count;
    data.push(pageData);
  }

  return data;
}

module.exports = retrieve;
