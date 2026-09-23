const { withCamoufoxSession } = require("../get-page-with-camoufox");
const { isBotChallengeResponse } = require("../bot-challenge");

// Since 2026-09-23 www.cineworld.co.uk answers requests that don't look like a
// browser with a 403. From the self-hosted runners the HTML pages still came
// back but the `/api/` proxy did not, and the refusal carried the challenge copy
// without a `cf-mitigated` header - so it could be a challenge or an outright
// block, and nothing in the response tells them apart. From a datacentre IP
// every path on the host, `robots.txt` included, is a `cf-mitigated` managed
// challenge. The apex domain and Webedia's asset CDN are unaffected.
//
// So the API calls are made from inside a Cineworld page in Camoufox: they
// then carry the browser's fingerprint and any clearance Cloudflare has handed
// the session, and are the same same-origin calls the site's own pages make.
// See `sources/dice.fm/retrieve.js` for the same approach against DICE.

// Gatsby's mount point. The real document carries it and a Cloudflare
// interstitial never does, so it separates "the challenge has been solved" from
// "still on the interstitial".
const SITE_SELECTOR = "#___gatsby";

// Cloudflare can re-check partway through, which destroys the execution context
// under an in-flight `evaluate`. Settle on the new document and repeat the call
// rather than failing - see the equivalent note in `sources/dice.fm`.
const CONTEXT_LOST = /Execution context was destroyed|frame was detached/i;
const EVALUATE_RETRIES = 2;

// Resolves once the page is the real site. Throws a timeout if it never gets
// there; callers decide how to classify that from the page itself.
const settleOnSite = (page) =>
  page.waitForSelector(SITE_SELECTOR, { state: "attached" });

// The raw response, unclassified: a retrieve and a health probe need different
// errors out of the same failure. `body` is only read in full when the request
// failed, where it is the evidence of what refused us.
const requestFromPage = async (page, url) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await page.evaluate(async (url) => {
        const response = await fetch(url, {
          headers: { Accept: "application/json, text/html;q=0.9" },
        });
        return {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          cfMitigated: response.headers.get("cf-mitigated"),
          body: await response.text(),
        };
      }, url);
    } catch (error) {
      if (attempt >= EVALUATE_RETRIES || !CONTEXT_LOST.test(error.message)) {
        throw error;
      }
      await settleOnSite(page);
    }
  }
};

// Open `url` in Camoufox and hand `fn` the settled page. `onUnsettled` turns a
// page that never became the site into the caller's own kind of error.
const withCineworldPage = (url, cacheKey, fn, { onUnsettled, ...options }) =>
  withCamoufoxSession((getPage) =>
    getPage(
      url,
      cacheKey,
      async (page, response) => {
        if (isBotChallengeResponse(response)) {
          console.log(
            "      - Challenge served; waiting for Camoufox to solve it",
          );
        }
        try {
          await settleOnSite(page);
        } catch (error) {
          return onUnsettled(page, response, error);
        }
        return fn(page);
      },
      options,
    ),
  );

module.exports = { requestFromPage, withCineworldPage };
