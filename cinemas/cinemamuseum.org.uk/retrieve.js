const cheerio = require("cheerio");
const slugify = require("slugify");
const getPageWithPlaywright = require("../../common/get-page-with-playwright");
const { domain } = require("./attributes");

async function retrieve() {
  let page = 1;
  const moviePageUrls = new Set();

  while (true) {
    const movieListPageUrl = `${domain}/schedule/category/events/page/${page}/`;
    const cacheKey = `cinemamuseum-page-${page}`;
    const movieListPage = await getPageWithPlaywright(
      movieListPageUrl,
      cacheKey,
      async (page) => {
        await page.waitForLoadState();
        await page
          .locator(".tribe-events-header__title-text")
          .waitFor({ strict: false });
        return await page.content();
      },
    );
    const $ = cheerio.load(movieListPage);
    const $entries = $("ul.tribe-events-calendar-list article");

    // Bail out when we find a page with no entries
    if ($entries.length === 0) break;

    page += 1;
    $entries.each(function () {
      const url = $(this)
        .find("a.tribe-events-calendar-list__event-title-link")
        .attr("href");
      moviePageUrls.add(url);
    });
  }

  const moviePages = {};
  for (const moviePageUrl of [...moviePageUrls]) {
    const moviePath = moviePageUrl.split("cinemamuseum.org.uk")[1];
    const cacheKey = `cinemamuseum-${slugify(moviePath)}`;
    moviePages[moviePageUrl] = await getPageWithPlaywright(
      moviePageUrl,
      cacheKey,
      async (page) => {
        await page.waitForLoadState();
        await page.locator("#tribe-events-content").waitFor({ strict: false });
        return await page.content();
      },
    );
  }

  return { moviePages };
}

module.exports = retrieve;
