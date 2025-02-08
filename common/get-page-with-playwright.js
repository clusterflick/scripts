const { chromium } = require("playwright-extra");
const { dailyCache } = require("./cache");

const stealth = require("puppeteer-extra-plugin-stealth")();
chromium.use(stealth);

async function getPageWithPlaywright(url, cacheKey, callback) {
  return dailyCache(cacheKey, async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    // Make the timeout much higher than default for running on slower runners
    context.setDefaultTimeout(90_000);
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    try {
      await page.goto(url);
      const result = await callback(page);
      await browser.close();
      return result;
    } catch (error) {
      try {
        await page.screenshot({
          path: `./playwright-failures/error--${cacheKey}.png`,
        });
      } catch (screenshotError) {
        console.log(
          `Unable to take error screenshot: ${screenshotError.message}`,
        );
      }
      throw error;
    } finally {
      await browser.close();
    }
  });
}

module.exports = getPageWithPlaywright;
