const getPageWithPlaywright = require("../get-page-with-playwright");
const { classifyPage, parseProbeJson, probeJson } = require("../health-probe");
const ocapiv1Health = require("../ocapi-v1/health");
const { requestFromPage, withCurzonPage } = require("./browser");

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

// Direct first, and through a Curzon page in Camoufox only once that is
// refused - see `browser.js` for what the refusal looks like, and for why the
// token still comes from the Playwright page rather than this one.
const withSession = (domain) => async (fn, getApi) => {
  try {
    return await fn({ getApi, requestJson: probeJson });
  } catch (error) {
    if (error.reason?.kind !== "bot-challenge") throw error;
    console.log(" ! - Refused directly; retrying through Camoufox ...");
  }

  return withCurzonPage(
    domain,
    // Never read - the cache is off - but named apart from the retrieve's.
    "health--curzon.com",
    (page) =>
      fn({
        getApi,
        requestJson: async (url, options) =>
          parseProbeJson(url, await requestFromPage(page, url, options)),
      }),
    {
      // An hourly probe must not replay the first answer of the day.
      disableCache: true,
      onUnsettled: (page, response) =>
        classifyPage(page, response, `No Curzon page at ${domain}`),
    },
  );
};

async function health(venues) {
  const { domain } = venues[0];
  return ocapiv1Health(venues, () => getApi(domain), {
    withSession: withSession(domain),
  });
}

module.exports = health;
