const getPageWithPlaywright = require("../../common/get-page-with-playwright");
const { fetchText } = require("../../common/utils");
const attributes = require("./attributes");

async function retrieve() {
  const movieListPage = await getPageWithPlaywright(
    attributes.domain,
    `chiswickcinema.co.uk`,
    async (page) => {
      await page.waitForLoadState();
      await page.locator(".header-top").waitFor({ strict: false });
      return page.evaluate(() => /* global window */ window.chiswick_data);
    },
  );

  const movieUrls = movieListPage.screenings.reduce(
    (urls, { films }) => films.reduce((urls, { url }) => urls.add(url), urls),
    new Set(),
  );

  const moviePages = {};
  for (const moviePageUrl of Array.from(movieUrls)) {
    moviePages[moviePageUrl] = await fetchText(moviePageUrl);
  }

  return { movieListPage, moviePages };
}

module.exports = retrieve;
