const getPageWithPlaywright = require("../get-page-with-playwright");

async function retrieve({ domain, url, cinemaId }) {
  const cacheKey = `myvue.com-${cinemaId}`;
  const data = await getPageWithPlaywright(url, cacheKey, async (page) => {
    await page.waitForLoadState();
    await page.locator(".header__box").waitFor();
    return page.evaluate(
      (url) => fetch(url).then((response) => response.json()),
      `${domain}/api/microservice/showings/cinemas/${cinemaId}/films?minEmbargoLevel=1&includesSession=true&includeSessionAttributes=true`,
    );
  });

  if (data.responseCode !== 0 || !data.result) {
    throw new Error(
      `MyVue API error for cinema ${cinemaId}: ${data.errorMessage || "unknown error"} (responseCode: ${data.responseCode})`,
    );
  }

  return data;
}

module.exports = retrieve;
