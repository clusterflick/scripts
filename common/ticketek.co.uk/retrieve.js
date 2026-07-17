const cheerio = require("cheerio");
const getPageWithPlaywright = require("../../common/get-page-with-playwright");
const { generateShowingId, assertSelector } = require("../../common/utils");

async function retrieve(attributes) {
  const url = `https://premier.ticketek.co.uk/shows/show.aspx?sh=${attributes.siteId}`;
  const movieListPage = await getPageWithPlaywright(
    url,
    attributes.id,
    async (page) => {
      await page.waitForLoadState();
      await page.locator("#contentShell").waitFor({ strict: false });
      return await page.content();
    },
  );

  const $ = cheerio.load(movieListPage);
  const movieUrls = $(".event-buttons a")
    .map((_, element) => $(element).attr("href"))
    .get();

  const moviePages = {};
  for (const movieUrl of movieUrls) {
    const showingUrl = new URL(movieUrl);
    const showingId = showingUrl.searchParams.get("sh");
    moviePages[movieUrl] = await getPageWithPlaywright(
      movieUrl,
      generateShowingId(attributes, showingId),
      async (page) => {
        await page.waitForLoadState();
        await page.locator("#contentShell").waitFor({ strict: false });
        return await page.content();
      },
    );
  }

  return { movieListPage, moviePages };
}

module.exports = retrieve;
