const getPageWithPlaywright = require("../get-page-with-playwright");
const { classifyPage } = require("../health-probe");
const ocapiv1Health = require("../ocapi-v1/health");

// The homepage, not a venue page. `retrieve.js` here loads each venue's page for
// its `vistaCinema.key`; the probe reads `cinemaId` off attributes instead, so
// it needs only the chain-wide bearer token any Curzon page carries.
const getApi = (domain) =>
  getPageWithPlaywright(
    domain,
    // Its own key, so the probe never shares - or poisons - the retrieve's
    // cache entries (`curzon.com-<venue>`).
    "health--curzon.com-api",
    async (page, response) => {
      await page.waitForLoadState();
      // Curzon have moved their API host before, so take it from the page
      // rather than hardcoding it - the same way the retrieval does.
      const api = await page.evaluate(
        () => /* global window */ window.initialData?.api,
      );
      if (!api?.authToken) {
        return classifyPage(page, response, `No API token on ${domain}`);
      }
      return api;
    },
    // See the Odeon probe: an hourly run must not replay a stale token.
    { disableCache: true },
  );

async function health(venues) {
  return ocapiv1Health(venues, () => getApi(venues[0].domain));
}

module.exports = health;
