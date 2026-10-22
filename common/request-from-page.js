const {
  classifyPageRequest,
  describeClassification,
  logRefusal,
} = require("./bot-challenge");
const { sleep, withJitter } = require("./utils");

// A `fetch` made from inside a browser page, for an API that only answers a
// browser - it carries the page's fingerprint and cookies, as the site's own
// calls do. Works on any Playwright page, Camoufox's or Chromium's; see
// `common/camoufox-site-page.js` for opening one in Camoufox.

// Cloudflare can re-check partway through, which destroys the execution context
// under an in-flight `evaluate`. Settle on the new document and repeat the call
// rather than failing - see the equivalent note in `sources/dice.fm`. A caller
// that knows what its real page looks like passes a `settle` that waits for it;
// otherwise the new document loading is all there is to wait for.
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
//
// That same `status: 0` is also what a dropped connection looks like, and
// `fetchWithRetry` gives a direct request one retry after ~30s for exactly
// that. A call made from a page gets the same single retry, or a connection
// reset on the browser path fails what it would have recovered from directly:
// Cineworld's health probe lost ten venues to one "NetworkError" while the
// next call, a second later, came back whole. A refusal is the same answer
// twice, so it costs one wait and is then reported as before.
const settleOnLoad = (page) => page.waitForLoadState();

const UNREADABLE_RETRY_MS = 30_000;

const requestFromPage = async (page, url, init, settle = settleOnLoad) => {
  let response = await evaluateRequest(page, url, init, settle);
  if (response.status === 0) {
    const wait = withJitter(UNREADABLE_RETRY_MS);
    console.log(
      ` ! - No readable response from ${url} (${response.statusText}), retrying in ${Math.round(wait / 1000)}s ...`,
    );
    await sleep(wait);
    response = await evaluateRequest(page, url, init, settle);
  }
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

// Say which refusal a `requestFromPage` response was: a challenge the browser
// failed to solve and an outright block need different next steps, and a bare
// 403 says neither.
const describeRefusal = (response) => {
  const refusal = classifyPageRequest(response);
  return refusal
    ? describeClassification(refusal)
    : `${response.status} ${response.statusText}`;
};

module.exports = { describeRefusal, requestFromPage };
