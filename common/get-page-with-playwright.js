const fs = require("node:fs").promises;
const path = require("node:path");
const { chromium } = require("playwright-extra");
const { dailyCache } = require("./cache");

const stealth = require("puppeteer-extra-plugin-stealth")();
chromium.use(stealth);

// `page.content()`, `page.close()` and `browser.close()` send no timeout to the
// browser, and the server treats a missing timeout as no deadline at all - so
// unlike `goto`/`waitFor`/`screenshot` they do NOT honour
// `context.setDefaultTimeout` and will wait forever on a wedged renderer. Bound
// them on a wall clock instead: teardown and diagnostics must never outlive the
// failure they're describing. Losing the race leaves the original promise
// pending, but `Promise.race` has already attached handlers to it, so a late
// rejection won't surface as an unhandled rejection.
const CONTENT_CAPTURE_TIMEOUT_MS = 30_000;
const CLOSE_TIMEOUT_MS = 15_000;

function withDeadline(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve, reject) => {
      // Deliberately NOT unref'd: if the hung call is the only thing left, an
      // unref'd timer lets Node exit 0 mid-run rather than firing the deadline -
      // a silent truncated retrieve, which is worse than the stall this fixes.
      // The `finally` below clears it, so it can't outlive the race either way.
      timer = setTimeout(
        () => reject(new Error(`${label} exceeded ${ms}ms`)),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

// Run `fn` with a `getPage` helper that shares one browser + context across every
// call - reused for speed and to carry cookies (e.g. a Cloudflare clearance)
// across pages like a real session. The browser launches lazily on the first
// cache miss, so fully-cached runs and replay tests launch nothing.
async function withPlaywrightSession(fn, sessionOptions = {}) {
  let browser;
  let context;

  // Lazily launch (or relaunch if a page crash disconnected the browser) the
  // shared context. Only called on a real fetch (cache miss).
  const ensureContext = async (options) => {
    if (!browser || !browser.isConnected()) {
      // Default to headless. Venues behind a Cloudflare challenge can opt into
      // headed mode (via `options.launch`) which has a much better chance of
      // passing the challenge - the headless fingerprint is the main giveaway.
      // Playwright's own SIGTERM handler closes the browser but never exits the
      // process, so a SIGTERM leaves this process alive with no browser - the
      // resulting errors get caught as ordinary fetch failures and the retrieve
      // carries on regardless. A pipeline step timing out then leaves the old
      // attempt racing its replacement, both writing the same output file.
      // Opting out restores Node's default (terminate on SIGTERM).
      // SIGINT is untouched, so Ctrl-C still closes the browser gracefully.
      browser = await chromium.launch({
        headless: true,
        handleSIGTERM: false,
        ...sessionOptions.launch,
        ...options.launch,
      });
      context = await browser.newContext();
      // Make the timeout much higher than default for running on slower runners
      context.setDefaultTimeout(90_000);
    }
    return context;
  };

  const getPage = (url, cacheKey, callback, options = {}) => {
    const load = async () => {
      const ctx = await ensureContext(options);
      const page = await ctx.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
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
        // does return is worthless (an empty `<html><head></head><body></body>`
        // has been the observed result). Skip straight to rethrowing. Other
        // screenshot failures - a crashed or already-closed target - still fail
        // fast below with a useful message, so they're worth attempting.
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
        // Close the page but keep the browser + context for the next call.
        try {
          await withDeadline(page.close(), CLOSE_TIMEOUT_MS, "page.close()");
        } catch (closeError) {
          // A tab that won't close is wedged below the page level, so the shared
          // context can't be trusted for the next call - and leaving it in place
          // means every later page inherits the problem (and leaks this tab).
          // Drop the whole browser so `ensureContext` relaunches a clean one,
          // which is also what makes the caller's retry able to succeed.
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
    };

    // The cache is keyed on the calendar day, which suits a retrieve - it runs
    // once and a repeat within the day is a retry that should reuse what it
    // already fetched. A caller whose whole point is a fresh answer (a health
    // probe running hourly, or anything reading a short-lived token off the
    // page) has to opt out, or it spends the day replaying the first response.
    const disableCache = options.disableCache ?? sessionOptions.disableCache;
    return disableCache ? load() : dailyCache(cacheKey, load);
  };

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
// single-call consumers keep today's behaviour unchanged.
function getPageWithPlaywright(url, cacheKey, callback, options = {}) {
  return withPlaywrightSession(
    (getPage) => getPage(url, cacheKey, callback, options),
    options,
  );
}

module.exports = getPageWithPlaywright;
module.exports.withPlaywrightSession = withPlaywrightSession;
