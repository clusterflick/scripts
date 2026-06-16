const cheerio = require("cheerio");
const getPageWithPlaywright = require("../../common/get-page-with-playwright");
const { id, domain } = require("./attributes");

async function retrieve() {
  const movieListPageUrl = `${domain}/search_film_programmes/`;

  return getPageWithPlaywright(
    movieListPageUrl,
    id,
    async (page) => {
      await page.waitForLoadState();

      try {
        await page.waitForSelector(".inner_block_3");
      } catch {
        console.log(" - ⚠️ Unexpected page detected (Cloudflare challenge?)");
        throw new Error("Unexpected page detected");
      }

      const movieListPage = await page.content();

      const $ = cheerio.load(movieListPage);
      const moviePageUrls = new Set();
      $(".inner_block_3 a").each(function () {
        const url = $(this).attr("href");
        moviePageUrls.add(url);
      });

      const moviePages = {};
      for (const moviePageUrl of [...moviePageUrls]) {
        await page.goto(moviePageUrl);
        await page.waitForLoadState("networkidle");
        moviePages[moviePageUrl] = await page.content();
      }

      return { movieListPage, moviePages };
    },
    { launch: { headless: false } },
  );
}

module.exports = retrieve;
