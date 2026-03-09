const ocapiv1Retrieve = require("../ocapi-v1/retrieve");
const getPageWithPlaywright = require("../get-page-with-playwright");

async function retrieve(attributes) {
  const path = attributes.url.replace(attributes.domain, "");
  const omniaUrl = `https://www.curzon.com/api/omnia/v1/page?friendly=${path}/`;

  const { cinemaId, api } = await getPageWithPlaywright(
    attributes.url,
    `curzon.com-${attributes.id}`,
    async (page) => {
      await page.waitForLoadState("domcontentloaded");

      const [workflowDataData, inititialiseData] = await Promise.all([
        page.evaluate((url) => fetch(url).then((r) => r.json()), omniaUrl),
        page.evaluate(() => /* global window */ window.initialData),
      ]);

      return {
        cinemaId: workflowDataData.vistaCinema.key,
        api: inititialiseData.api,
      };
    },
  );

  return ocapiv1Retrieve({ ...attributes, cinemaId }, api);
}

module.exports = retrieve;
