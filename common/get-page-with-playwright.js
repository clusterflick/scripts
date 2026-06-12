const fs = require("node:fs").promises;
const path = require("node:path");
const { chromium } = require("playwright-extra");
const { dailyCache } = require("./cache");

const stealth = require("puppeteer-extra-plugin-stealth")();
chromium.use(stealth);

async function getPageWithPlaywright(url, cacheKey, callback, options = {}) {
  return dailyCache(cacheKey, async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    // Make the timeout much higher than default for running on slower runners
    context.setDefaultTimeout(90_000);
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    try {
      await page.goto(url, options.goto);
      const result = await callback(page);
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
        console.log(`Unable to capture page content: ${contentError.message}`);
      }
      throw error;
    } finally {
      await browser.close();
    }
  });
}

module.exports = getPageWithPlaywright;
