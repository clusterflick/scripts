const {
  describeRefusal,
  requestFromPage,
  withSitePage,
} = require("../camoufox-site-page");
const { retrievePaginatedListView } = require("./retrieve");

// For a Tribe site whose host challenges plain requests - SiteGround, in Stanley
// Arts' case, which on 2026-10-09 started answering the self-hosted runner with
// its 202 "Robot Challenge Screen". From an IP it challenged the same way, a
// headless browser was let straight through, list view and REST calls alike.
// So the list view is walked from inside one of the site's pages in Camoufox,
// and every request carries the browser's fingerprint and whatever
// clearance the session has earned - see `common/camoufox-site-page.js`.
//
// The listing page itself is fetched from inside the page too, rather than read
// off the DOM: the plugin's own script removes the nonce element once it has
// read it, so the rendered page no longer carries what `extractNonce` needs.

// Every Tribe view renders into this container, and SiteGround's interstitial -
// a bare meta refresh to `/.well-known/sgcaptcha/` - never has it.
const settleOnSite = (page) =>
  page.waitForSelector("[data-js='tribe-events-view']", { state: "attached" });

const overBrowser = (page) => ({
  text: async (url) => {
    const response = await requestFromPage(page, url, undefined, settleOnSite);
    if (!response.ok || response.sgCaptcha === "challenge") {
      throw new Error(
        `Failed to fetch ${url} from inside a Tribe events page - ${describeRefusal(response)}`,
      );
    }
    return response.body;
  },
});

const retrievePaginatedListViewWithBrowser = (options, cacheKey) =>
  withSitePage(
    options.initialPageUrl,
    cacheKey,
    {
      settle: settleOnSite,
      onUnsettled: async (page, response, error) =>
        new Error(
          `Tribe events page never loaded past the bot challenge at ${page.url()} (${error.message})`,
        ),
    },
    (page) =>
      retrievePaginatedListView({ ...options, transport: overBrowser(page) }),
  );

module.exports = { retrievePaginatedListViewWithBrowser };
