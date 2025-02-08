const getPageWithPlaywright = require("../get-page-with-playwright");

async function retrieve({ domain, url, cinemaId }) {
  const cacheKey = `myvue.com-${cinemaId}`;
  return await getPageWithPlaywright(url, cacheKey, async (page) => {
    await page.waitForLoadState();
    await page.locator(".header__box").waitFor();
    return page.evaluate(
      (url) => fetch(url).then((response) => response.json()),
      `${domain}/api/microservice/showings/cinemas/${cinemaId}/films`,
    );
  });
}

module.exports = retrieve;
