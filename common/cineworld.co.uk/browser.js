const {
  requestFromPage: requestFromSitePage,
  withSitePage,
} = require("../camoufox-site-page");

// Since 2026-09-23 www.cineworld.co.uk answers requests that don't look like a
// browser with a 403. From the self-hosted runners the HTML pages still came
// back but the `/api/` proxy did not, and the refusal carried the challenge copy
// without a `cf-mitigated` header - so it could be a challenge or an outright
// block, and nothing in the response tells them apart. From a datacentre IP
// every path on the host, `robots.txt` included, is a `cf-mitigated` managed
// challenge. The apex domain and Webedia's asset CDN are unaffected.
//
// So the API calls are made from inside a Cineworld page in Camoufox - see
// `common/camoufox-site-page.js`.

// Gatsby's mount point. The real document carries it and a Cloudflare
// interstitial never does, so it separates "the challenge has been solved" from
// "still on the interstitial".
const SITE_SELECTOR = "#___gatsby";

const settleOnSite = (page) =>
  page.waitForSelector(SITE_SELECTOR, { state: "attached" });

const requestFromPage = (page, url) =>
  requestFromSitePage(
    page,
    url,
    { headers: { Accept: "application/json, text/html;q=0.9" } },
    settleOnSite,
  );

const withCineworldPage = (url, cacheKey, fn, options) =>
  withSitePage(url, cacheKey, { settle: settleOnSite, ...options }, fn);

module.exports = { requestFromPage, withCineworldPage };
