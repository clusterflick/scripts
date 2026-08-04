const fs = require("node:fs").promises;
const path = require("node:path");
const { chromium } = require("playwright-extra");
const { dailyCache } = require("./cache");

const stealth = require("puppeteer-extra-plugin-stealth")();
chromium.use(stealth);

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

  const getPage = (url, cacheKey, callback, options = {}) =>
    dailyCache(cacheKey, async () => {
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
        const failuresDir = path.join(process.cwd(), "playwright-failures");
        try {
          await page.screenshot({
            path: path.join(failuresDir, `error--${cacheKey}.png`),
          });
        } catch (screenshotError) {
          console.log(
            `Unable to take error screenshot: ${screenshotError.message}`,
          );
        }
        try {
          const content = await page.content();
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
        throw error;
      } finally {
        // Close the page but keep the browser + context for the next call.
        await page.close();
      }
    });

  try {
    return await fn(getPage);
  } finally {
    if (browser) await browser.close();
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
