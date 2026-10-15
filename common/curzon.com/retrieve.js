const ocapiv1Retrieve = require("../ocapi-v1/retrieve");
const getPageWithPlaywright = require("../get-page-with-playwright");
const { retryThroughCamoufox } = require("../camoufox-escalation");
const { describeRefusal } = require("../camoufox-site-page");
const { requestFromPage, withCurzonPage } = require("./browser");

const overBrowser = (page) => ({
  json: async (url, init) => {
    const response = await requestFromPage(page, url, init);
    // Read as the direct transport reads it: only a refusal is an error here,
    // since an OCAPI error body is still JSON and the retrieve checks it.
    if (response.status === 403 || response.status === 0) {
      throw new Error(
        `Failed to fetch ${url} from inside a Curzon page - ${describeRefusal(response)}`,
      );
    }
    return JSON.parse(response.body);
  },
});

// The OCAPI calls again, from a Curzon page in Camoufox, with the token the
// Playwright step already read - it has always been sent from plain Node, so it
// isn't tied to the browser that was handed it.
const retrieveWithBrowser = (attributes, cinemaId, api) =>
  withCurzonPage(
    attributes.url,
    `curzon.com-browser-${attributes.id}`,
    (page) =>
      ocapiv1Retrieve({ ...attributes, cinemaId }, api, overBrowser(page)),
    { label: "Curzon page" },
  );

// The venue's page data, from inside the Playwright page. Its body is read
// whatever the status, as it always was. The first response is occasionally a
// non-JSON block or error page, so a body that isn't JSON is asked for once
// more, and a second one fails saying which refusal it was.
const fetchPageData = async (page, url) => {
  for (let attempt = 0; ; attempt += 1) {
    const response = await requestFromPage(page, url);
    try {
      return JSON.parse(response.body);
    } catch {
      if (attempt >= 1) {
        throw new Error(
          `Curzon answered ${url} without JSON - ${describeRefusal(response)}`,
        );
      }
    }
  }
};

async function retrieve(attributes) {
  const path = attributes.url.replace(attributes.domain, "");
  const omniaUrl = `https://www.curzon.com/api/omnia/v1/page?friendly=${path}/`;

  const { cinemaId, api } = await getPageWithPlaywright(
    attributes.url,
    `curzon.com-${attributes.id}`,
    async (page) => {
      await page.waitForLoadState("domcontentloaded");

      const [workflowDataData, inititialiseData] = await Promise.all([
        fetchPageData(page, omniaUrl),
        page.evaluate(() => /* global window */ window.initialData),
      ]);

      return {
        cinemaId: workflowDataData.vistaCinema.key,
        api: inititialiseData.api,
      };
    },
  );

  // Escalate on a 403 only, as Cineworld does - see `browser.js` for what the
  // refusal looks like and why it can't be told apart from here.
  return retryThroughCamoufox(
    () => ocapiv1Retrieve({ ...attributes, cinemaId }, api),
    () => retrieveWithBrowser(attributes, cinemaId, api),
    { isRefusal: (error) => error.status === 403 },
  );
}

module.exports = retrieve;
