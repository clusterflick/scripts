const { withCamoufoxSession } = require("./get-page-with-camoufox");
const {
  classifyPageRequest,
  describeClassification,
  isBotBlockText,
  logRefusal,
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
// failure it is the evidence of what refused us. A refusal is logged here all
// the same, so one made from inside a page shows up beside the rest.
//
// `headers` carries the vendor challenge headers `classifyPageRequest` reads;
// `cfMitigated` and `sgCaptcha` are the same values, kept for the callers that
// read them directly.
//
// A cross-origin call that is refused without CORS headers never produces a
// readable response - only an opaque "Failed to fetch" - so that comes back as
// `status: 0` with the message, rather than as a thrown network error that
// would read as the API being down.
const requestFromPage = async (page, url, init, settle) => {
  const response = await evaluateRequest(page, url, init, settle);
  const refusal = classifyPageRequest(response);
  if (refusal) logRefusal(refusal, url);
  return response;
};

const evaluateRequest = async (page, url, init, settle) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const { headers, ...response } = await page.evaluate(
        async ({ url, init }) => {
          let response;
          try {
            response = await fetch(url, init);
          } catch (error) {
            return {
              ok: false,
              status: 0,
              statusText: `refused before a response was readable (${error.message})`,
              headers: {},
              body: "",
            };
          }
          return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(
              ["cf-mitigated", "sg-captcha", "cdn-challenge"].map((name) => [
                name,
                response.headers.get(name),
              ]),
            ),
            body: await response.text(),
          };
        },
        { url, init },
      );
      return {
        ...response,
        headers,
        cfMitigated: headers["cf-mitigated"] ?? null,
        sgCaptcha: headers["sg-captcha"] ?? null,
      };
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
const describeRefusal = (response) => {
  const refusal = classifyPageRequest(response);
  return refusal
    ? describeClassification(refusal)
    : `${response.status} ${response.statusText}`;
};

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
