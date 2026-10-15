const getPageWithPlaywright = require("../get-page-with-playwright");
const { describeRefusal, requestFromPage } = require("../request-from-page");

// The listings API answers a plain fetch with a 401, so the call is made from
// inside a Vue page. Its body is read whatever the status, as it always was: an
// error still arrives as JSON, and `responseCode` below says what went wrong.
// Only a body that isn't JSON at all - an interstitial, a block page - fails
// here, saying which refusal it was.
const fetchFilms = async (page, url) => {
  const response = await requestFromPage(page, url);
  try {
    return JSON.parse(response.body);
  } catch {
    throw new Error(
      `MyVue API answered ${url} without JSON - ${describeRefusal(response)}`,
    );
  }
};

async function retrieve({ domain, url, cinemaId }) {
  const cacheKey = `myvue.com-${cinemaId}`;
  const data = await getPageWithPlaywright(url, cacheKey, async (page) => {
    await page.waitForLoadState();
    await page.locator(".header__box").waitFor();
    return fetchFilms(
      page,
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
