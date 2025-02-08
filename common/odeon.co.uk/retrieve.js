const getPageWithPlaywright = require("../get-page-with-playwright");
const ocapiv1Retrieve = require("../ocapi-v1/retrieve");

async function retrieve(attributes) {
  const inititialiseData = await getPageWithPlaywright(
    attributes.domain,
    `odeon.co.uk-${attributes.cinemaId}`,
    async (page) => {
      await page.waitForLoadState();
      await page.locator(".header-container").waitFor({ strict: false });
      return page.evaluate(() => /* global window */ window.initialData);
    },
  );
  return ocapiv1Retrieve(attributes, inititialiseData.api);
}

module.exports = retrieve;
