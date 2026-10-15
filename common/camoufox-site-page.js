const { withCamoufoxSession } = require("./get-page-with-camoufox");
const { isBotBlockText } = require("./bot-challenge");
const { describeRefusal, requestFromPage } = require("./request-from-page");

// For a site whose pages still load but whose API refuses anything that isn't
// a browser: open one of its pages in Camoufox and make the API calls from
// inside it. They then carry the browser's fingerprint and any clearance
// Cloudflare has handed the session, and are the same calls the site's own
// pages make. `sources/dice.fm/retrieve.js` is the same approach, written before
// a second chain needed it. The calls themselves are `requestFromPage`, which
// works on any browser page and is re-exported here for the callers that make
// them from a Camoufox one.

// The error for a page that never got past its interstitial, saying whether it
// was refused outright - a block, which no amount of waiting would have solved -
// or was still on a challenge. `label` names the site, as in "Cineworld page".
const unsettledError = (label) => async (page, response, error) =>
  new Error(
    isBotBlockText(await page.content().catch(() => null))
      ? `Blocked outright (not challenged) at ${page.url()} - the request was refused, not scored`
      : `${label} never loaded past the bot challenge at ${page.url()} (${error.message})`,
  );

// Open `url` in Camoufox and hand `fn` the page once `settle` says it is the
// real site rather than an interstitial. `onUnsettled` turns a page that never
// got there into the caller's own kind of error; without one, it is
// `unsettledError(label)`.
const withSitePage = (
  url,
  cacheKey,
  { settle, label, onUnsettled = unsettledError(label), ...options },
  fn,
) =>
  withCamoufoxSession((getPage) =>
    getPage(
      url,
      cacheKey,
      // A challenge on the navigation is logged by the session; `settle` is
      // what waits for Camoufox to solve it.
      async (page, response) => {
        try {
          await settle(page);
        } catch (error) {
          return onUnsettled(page, response, error);
        }
        return fn(page);
      },
      options,
    ),
  );

module.exports = { describeRefusal, requestFromPage, withSitePage };
