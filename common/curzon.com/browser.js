const { BOT_CHALLENGE_TEXT } = require("../bot-challenge");
const {
  requestFromPage: requestFromSitePage,
  withSitePage,
} = require("../camoufox-site-page");

// Since the afternoon of 2026-09-23 Curzon's OCAPI host (digital-api.curzon.com)
// refuses direct requests from the self-hosted runners with a 403 carrying
// Cloudflare's page copy but no `cf-mitigated` header, while a Playwright load
// of the site itself still gets through. From a datacentre IP both hosts serve
// Cloudflare's *block* page rather than a challenge ("Sorry, you have been
// blocked ... app.vista.co") - the zone is Vista's, who host the site and the
// API - so a refusal here may be a scored block rather than a puzzle.
//
// So the OCAPI calls are made from inside a Curzon page in Camoufox - see
// `common/camoufox-site-page.js`. They are cross-origin from the site to its
// API host, exactly as the site's own pages make them.

// Camoufox evaluates in an isolated world, so the site's own globals - the
// `window.initialData` the Playwright step reads the token from - are invisible
// here; reaching them needs `main_world_eval`, which gives up the isolation
// Camoufox relies on not to be detected. Nothing needs them: the token comes
// from the Playwright step, which still loads the site. What this page has to
// be is the real site rather than Cloudflare's interstitial or block page,
// which the DOM does show - both carry their copy in the title.
const settleOnSite = (page) =>
  page.waitForFunction(
    (challenge) =>
      /* global document */
      document.readyState !== "loading" &&
      !new RegExp(challenge, "i").test(document.title),
    BOT_CHALLENGE_TEXT.source,
  );

const requestFromPage = (page, url, init) =>
  requestFromSitePage(page, url, init, settleOnSite);

const withCurzonPage = (url, cacheKey, fn, options) =>
  withSitePage(url, cacheKey, { settle: settleOnSite, ...options }, fn);

module.exports = { requestFromPage, withCurzonPage };
