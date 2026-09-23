const ocapiv1Retrieve = require("../ocapi-v1/retrieve");
const getPageWithPlaywright = require("../get-page-with-playwright");
const { isBotBlockText } = require("../bot-challenge");
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
    {
      onUnsettled: async (page, response, error) =>
        new Error(
          isBotBlockText(await page.content().catch(() => null))
            ? `Blocked outright (not challenged) at ${page.url()} - the request was refused, not scored`
            : `Curzon page never loaded past Cloudflare (${error.message})`,
        ),
    },
  );

async function retrieve(attributes) {
  const path = attributes.url.replace(attributes.domain, "");
  const omniaUrl = `https://www.curzon.com/api/omnia/v1/page?friendly=${path}/`;

  const { cinemaId, api } = await getPageWithPlaywright(
    attributes.url,
    `curzon.com-${attributes.id}`,
    async (page) => {
      await page.waitForLoadState("domcontentloaded");

      const [workflowDataData, inititialiseData] = await Promise.all([
        page.evaluate(async (url) => {
          try {
            return await fetch(url).then((r) => r.json());
          } catch {
            // Retry once - the first response is occasionally a non-JSON
            // block/error page
            return await fetch(url).then((r) => r.json());
          }
        }, omniaUrl),
        page.evaluate(() => /* global window */ window.initialData),
      ]);

      return {
        cinemaId: workflowDataData.vistaCinema.key,
        api: inititialiseData.api,
      };
    },
  );

  try {
    return await ocapiv1Retrieve({ ...attributes, cinemaId }, api);
  } catch (error) {
    // Escalate on a 403 only, as Cineworld does - see `browser.js` for what
    // the refusal looks like and why it can't be told apart from here.
    if (error.status !== 403) throw error;

    console.log(
      "    - Refused with a 403; retrying through Camoufox, which carries a browser fingerprint and can solve a challenge",
    );
    return await retrieveWithBrowser(attributes, cinemaId, api);
  }
}

module.exports = retrieve;
