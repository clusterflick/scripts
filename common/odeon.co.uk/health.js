const getPageWithPlaywright = require("../get-page-with-playwright");
const { classifyPage } = require("../health-probe");
const ocapiv1Health = require("../ocapi-v1/health");

// The bearer token is chain-wide - it comes off the homepage, not a venue page -
// so one browser bootstrap serves the whole estate.
const getApi = (domain) =>
  getPageWithPlaywright(
    domain,
    // Its own key, so the probe never shares - or poisons - the retrieve's
    // cache entries (`odeon.co.uk-<cinemaId>`).
    "health--odeon.co.uk-api",
    async (page, response) => {
      await page.waitForLoadState();
      await page.locator(".header-container").waitFor({ strict: false });
      const api = await page.evaluate(
        () => /* global window */ window.initialData?.api,
      );
      if (!api?.authToken) {
        return classifyPage(page, response, `No API token on ${domain}`);
      }
      return api;
    },
    // The day cache would have an hourly probe replaying this morning's token
    // and reporting its expiry as an outage. Only bites on a runner that keeps
    // its workspace, which is the self-hosted case this is meant for.
    { disableCache: true },
  );

async function health(venues) {
  return ocapiv1Health(venues, () => getApi(venues[0].domain));
}

module.exports = health;
