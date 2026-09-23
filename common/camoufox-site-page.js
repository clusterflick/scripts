const { withCamoufoxSession } = require("./get-page-with-camoufox");
const {
  BOT_CHALLENGE_TEXT,
  isBotBlockText,
  isBotChallengeResponse,
} = require("./bot-challenge");

// For a site whose pages still load but whose API refuses anything that isn't
// a browser: open one of its pages in Camoufox and make the API calls from
// inside it. They then carry the browser's fingerprint and any clearance
// Cloudflare has handed the session, and are the same calls the site's own
// pages make. `sources/dice.fm/retrieve.js` is the same approach, written before
// a second chain needed it.

// Cloudflare can re-check partway through, which destroys the execution context
// under an in-flight `evaluate`. Settle on the new document and repeat the call
// rather than failing - see the equivalent note in `sources/dice.fm`.
const CONTEXT_LOST = /Execution context was destroyed|frame was detached/i;
const EVALUATE_RETRIES = 2;

// The raw response, unclassified: a retrieve and a health probe need different
// errors out of the same failure. `body` is read in full either way, since on a
// failure it is the evidence of what refused us.
//
// A cross-origin call that is refused without CORS headers never produces a
// readable response - only an opaque "Failed to fetch" - so that comes back as
// `status: 0` with the message, rather than as a thrown network error that
// would read as the API being down.
const requestFromPage = async (page, url, init, settle) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await page.evaluate(
        async ({ url, init }) => {
          let response;
          try {
            response = await fetch(url, init);
          } catch (error) {
            return {
              ok: false,
              status: 0,
              statusText: `refused before a response was readable (${error.message})`,
              cfMitigated: null,
              body: "",
            };
          }
          return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            cfMitigated: response.headers.get("cf-mitigated"),
            body: await response.text(),
          };
        },
        { url, init },
      );
    } catch (error) {
      if (attempt >= EVALUATE_RETRIES || !CONTEXT_LOST.test(error.message)) {
        throw error;
      }
      await settle(page);
    }
  }
};

// Say which refusal a `requestFromPage` response was: a challenge Camoufox
// failed to solve and an outright block need different next steps, and a bare
// 403 says neither.
const describeRefusal = ({ status, statusText, cfMitigated, body }) => {
  if (cfMitigated === "challenge") return `${status} challenge (cf-mitigated)`;
  if (isBotBlockText(body)) return `${status} blocked outright`;
  if (BOT_CHALLENGE_TEXT.test(body)) return `${status} challenge (page copy)`;
  return `${status} ${statusText}`;
};

// Open `url` in Camoufox and hand `fn` the page once `settle` says it is the
// real site rather than an interstitial. `onUnsettled` turns a page that never
// got there into the caller's own kind of error.
const withSitePage = (url, cacheKey, { settle, onUnsettled, ...options }, fn) =>
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
