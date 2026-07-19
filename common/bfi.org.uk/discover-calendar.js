const cheerio = require("cheerio");
const { format, addYears } = require("date-fns");
const getPageWithPlaywright = require("../get-page-with-playwright");
const { getText, getId } = require("../utils");

const dateFormat = "yyyy-MM-dd";

// Collect the shows from one calendar search results page. We take the URL (with
// its context_id stripped), the article id it carries, and the title - the
// performances come from each show's own listing page (see getShow), not here.
function extractShows($) {
  const shows = [];
  $(".result-box-item").each(function () {
    const $showLink = $(this).find("a.more-info");
    const href = $showLink.attr("href");
    // Sometimes the BFI listings aren't links. If so, there's nothing we can do
    // but skip it and hope they fix the issue in a future run.
    if (!href) return;

    const showUrl = href.split(
      "&BOparam::WScontent::loadArticle::context_id=",
    )[0];
    const articleId = (showUrl.match(/article_id=([0-9A-F-]+)/i) || [])[1];
    shows.push({ showUrl, articleId, title: getText($showLink) });
  });
  return shows;
}

// Page through the year-long calendar search and return the discovered shows
// (deduped by URL - the same article can appear on several pages) alongside the
// raw result pages. Does not load any article pages.
async function discoverCalendarShows(attributes) {
  const { articleId, url } = attributes;

  const today = new Date();
  const start = format(today, dateFormat);
  const end = format(addYears(today, 1), dateFormat);

  const urlQuery = [
    `doWork%3A%3AWScontent%3A%3Asearch=1`,
    `BOparam%3A%3AWScontent%3A%3Asearch%3A%3Aarticle_search_id=${articleId}`,
    `BOset%3A%3AWScontent%3A%3ASearchCriteria%3A%3Asearch_from=${start}`,
    `BOset%3A%3AWScontent%3A%3ASearchCriteria%3A%3Asearch_to=${end}`,
  ];

  console.log("");
  console.log(`    - [${Date.now()}] Retrieving search results pages ... `);

  const cacheKey = `bfi.org.uk-${getId(articleId)}-${articleId}`;
  const movieListPage = await getPageWithPlaywright(
    url,
    cacheKey,
    async (page) => {
      const pages = [];

      // Go to the main page first, let it load, and then get the search results
      await page.waitForLoadState("domcontentloaded");
      await page.goto(`${url}?${urlQuery.join("&")}`);

      while (true) {
        // Wait until the page is finished everything
        try {
          await page.waitForLoadState("networkidle");
        } catch {
          // If this fails, it'll be because it timed out. At that point, we
          // might as well keep going and see if the next waitFor passes.
        }

        // Race between error page and search results
        const errorLocator = page
          .locator("#content h2")
          .filter({ hasText: /500 - internal server error/i });
        const resultsLocator = page.locator(".detailed-search-results");

        await errorLocator.or(resultsLocator).waitFor({ state: "attached" });

        if (await errorLocator.isVisible()) {
          const errorText = await errorLocator.textContent();
          throw new Error(`Error page detected - ${errorText}`);
        }

        pages.push(await page.content());

        const $nextPageButton = page.locator("#av-next-link");
        if ((await $nextPageButton.count()) > 0) {
          await $nextPageButton.click();

          // Wait for the next page to load
          const nextPageNumber = `${pages.length + 1}`;
          // Wait for the URL to change
          await page.waitForURL((url) =>
            url
              .toString()
              .includes(
                `&BOset::WScontent::SearchResultsInfo::current_page=${nextPageNumber}&`,
              ),
          );
          // Wait for the pagination to update
          await page
            .locator(".av-paging-links.active", { hasText: nextPageNumber })
            .waitFor();
        } else {
          // If there's no next page button, we're at the end
          break;
        }
      }
      return pages;
    },
  );

  const seen = new Set();
  const shows = [];
  for (const searchResultPage of movieListPage) {
    for (const show of extractShows(cheerio.load(searchResultPage))) {
      if (seen.has(show.showUrl)) continue;
      seen.add(show.showUrl);
      shows.push(show);
    }
  }

  return { movieListPage, shows };
}

module.exports = discoverCalendarShows;
