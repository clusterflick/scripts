const fs = require("node:fs").promises;
const path = require("node:path");
const { dailyCache } = require("./cache");

// Sibling of `get-page-with-playwright.js` for venues behind a Cloudflare
// Managed Challenge, which the stealth-plugin Chromium there cannot solve.
// Camoufox is a patched Firefox with an anti-detection fingerprint; it launches
// differently enough (its own browser factory, no explicit viewport, a
// platform-dependent headless mode) that threading an engine flag through the
// other helper would fork its internals in several places. The duplicated
// diagnostics and teardown are the accepted cost of that.

// See the equivalent comment in `get-page-with-playwright.js`: these calls send
// no timeout to the browser, so they ignore `setDefaultTimeout` and must be
// bounded on a wall clock instead.
const CONTENT_CAPTURE_TIMEOUT_MS = 30_000;
const CLOSE_TIMEOUT_MS = 15_000;

function withDeadline(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve, reject) => {
      // Deliberately NOT unref'd - see `get-page-with-playwright.js`.
      timer = setTimeout(
        () => reject(new Error(`${label} exceeded ${ms}ms`)),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

// Camoufox's "virtual" mode runs the browser against an Xvfb display, which is
// far less detectable than true headless - but it asserts Linux and throws
// anywhere else. So macOS runners get true headless, which is the mode the
// Close-Up challenge was first beaten with, and a local run gets a real window.
function getHeadlessMode() {
  if (!process.env.CI) return false;
  return process.platform === "linux" ? "virtual" : true;
}

// Run `fn` with a `getPage` helper that shares one browser + context across every
// call - reused for speed and to carry the Cloudflare clearance cookie across
// pages like a real session. The browser launches lazily on the first call that
// actually needs it, so fully-cached runs and replay tests launch nothing.
async function withCamoufoxSession(fn, sessionOptions = {}) {
  let browser;
  let context;
  // Once a request has been challenged, every later request in this session goes
  // through the browser. Dropping back to a plain fetch would abandon the
  // clearance cookie the browser is holding and invite a fresh challenge.
  let escalated = false;

  const ensureContext = async (options) => {
    if (!browser || !browser.isConnected()) {
      // Required lazily: `cinemas/index.js` requires every venue module to read
      // attributes, and camoufox-js pulls in native dependencies. Loading it
      // only when a browser is actually needed keeps it out of every process in
      // every repo that depends on this package.
      const { Camoufox } = require("camoufox-js");
      browser = await Camoufox({
        headless: getHeadlessMode(),
        // `geoip` aligns timezone/locale/coordinates with the exit IP, and
        // `humanize` paces cursor movement - both are fingerprint signals the
        // challenge scores.
        geoip: true,
        humanize: true,
        // Playwright's SIGTERM handler closes the browser without exiting the
        // process, which would leave a retrying pipeline step racing its
        // replacement. See `get-page-with-playwright.js`.
        handleSIGTERM: false,
        ...sessionOptions.launch,
        ...options.launch,
      });
      // Camoufox spoofs the window dimensions it reports to the page, so a
      // pinned viewport would contradict its own fingerprint - and its patched
      // Firefox rejects one outright.
      context = await browser.newContext({ viewport: null });
      // Much higher than the default for slower runners - a Pi driving Firefox
      // with humanized delays is not quick.
      context.setDefaultTimeout(90_000);
    }
    return context;
  };

  // Fetch `url`, preferring a cheap request over the browser.
  //
  // `options.withoutBrowser` is an optional `async (url) => string | null`. When
  // the session has not yet been challenged it is tried first; returning a
  // string skips the browser entirely, and returning null reports a challenge
  // and escalates the rest of the session. Without it, every call uses the
  // browser.
  const getPage = (url, cacheKey, callback, options = {}) =>
    dailyCache(cacheKey, async () => {
      if (options.withoutBrowser && !escalated) {
        const content = await options.withoutBrowser(url);
        if (content !== null) return content;
        escalated = true;
        console.log(
          "      - Challenged; escalating to Camoufox for the rest of this run",
        );
      }

      const ctx = await ensureContext(options);
      const page = await ctx.newPage();
      try {
        // Hand the navigation response to the callback as well as the page -
        // response headers carry signals the rendered page doesn't, such as
        // Cloudflare's `cf-mitigated: challenge` on a blocked request.
        const response = await page.goto(url, options.goto);
        const result = await callback(page, response);
        // Don't return Error objects - throw them so they don't get cached
        // (Error objects serialize to {} and lose their error nature)
        if (result instanceof Error) {
          throw result;
        }
        return result;
      } catch (error) {
        // Report the failure itself before any diagnostics. Everything below is
        // best-effort and can fail in its own right, so without this the only
        // thing ever logged is the diagnostics' own errors, never the cause.
        console.log(`      - Failed to retrieve ${cacheKey}: ${error.message}`);

        const failuresDir = path.join(process.cwd(), "playwright-failures");
        let screenshotTimedOut = false;
        try {
          await page.screenshot({
            path: path.join(failuresDir, `error--${cacheKey}.png`),
          });
        } catch (screenshotError) {
          // A screenshot honours the default timeout, so exhausting it means the
          // renderer stopped answering - not that the shot was merely awkward.
          screenshotTimedOut = screenshotError.name === "TimeoutError";
          console.log(
            `Unable to take error screenshot: ${screenshotError.message}`,
          );
        }

        // A wedged renderer can't serialize its DOM either, and what little it
        // does return is worthless. Skip straight to rethrowing.
        if (screenshotTimedOut) {
          console.log(
            "Skipping page content capture - the page stopped responding.",
          );
        } else {
          try {
            const content = await withDeadline(
              page.content(),
              CONTENT_CAPTURE_TIMEOUT_MS,
              "page.content()",
            );
            await fs.mkdir(failuresDir, { recursive: true });
            await fs.writeFile(
              path.join(failuresDir, `error--${cacheKey}.txt`),
              content,
            );
            const limit = 500;
            const snippet =
              content.length > limit
                ? `${content.slice(0, limit)}\n... [truncated, see error--${cacheKey}.txt for full content]`
                : content;

            console.log(
              `Page content at failure (${page.url()}), snippet:\n\n-----\n${snippet}\n-----`,
            );
          } catch (contentError) {
            console.log(
              `Unable to capture page content: ${contentError.message}`,
            );
          }
        }
        throw error;
      } finally {
        // Close the page but keep the browser + context for the next call - and
        // with them the challenge clearance, which is the whole point of
        // sharing a session with this venue.
        try {
          await withDeadline(page.close(), CLOSE_TIMEOUT_MS, "page.close()");
        } catch (closeError) {
          // A tab that won't close is wedged below the page level, so the shared
          // context can't be trusted for the next call. Drop the whole browser
          // so `ensureContext` relaunches a clean one - at the cost of the
          // clearance, which the next page will have to earn again.
          console.log(
            `${closeError.message} - discarding the browser session so the next page starts clean.`,
          );
          const wedged = browser;
          browser = undefined;
          context = undefined;
          try {
            await withDeadline(
              wedged.close(),
              CLOSE_TIMEOUT_MS,
              "browser.close()",
            );
          } catch (browserCloseError) {
            // Nothing further we can do - the process is left for Playwright to
            // reap at exit. Better a stray browser than a stalled run.
            console.log(
              `Unable to close wedged browser: ${browserCloseError.message}`,
            );
          }
        }
      }
    });

  try {
    return await fn(getPage);
  } finally {
    // Bounded for the same reason as above - a wedged browser must not be able
    // to hang the run on its way out, after all the work is already done.
    if (browser) {
      try {
        await withDeadline(
          browser.close(),
          CLOSE_TIMEOUT_MS,
          "browser.close()",
        );
      } catch (closeError) {
        console.log(`Unable to close browser: ${closeError.message}`);
      }
    }
  }
}

// Single-page helper: one browser, one page, closed after. A session of one, so
// single-call consumers keep the same shape as the Playwright helper.
function getPageWithCamoufox(url, cacheKey, callback, options = {}) {
  return withCamoufoxSession(
    (getPage) => getPage(url, cacheKey, callback, options),
    options,
  );
}

module.exports = getPageWithCamoufox;
module.exports.withCamoufoxSession = withCamoufoxSession;
