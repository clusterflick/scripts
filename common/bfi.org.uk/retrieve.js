const cheerio = require("cheerio");
const { format, addYears } = require("date-fns");
const slugify = require("slugify");
const getPageWithPlaywright = require("../get-page-with-playwright");
const getShow = require("./get-show");
const { getText, getId } = require("../utils");

const dateFormat = "yyyy-MM-dd";

// Collect the show URLs (one per article) from a calendar search results page.
// We only take the URL and title here - the performances come from each show's
// own listing page (see getShow), not from the calendar rows.
function discoverShows($, moviePages) {
  const $showLinks = $(".result-box-item");
  $showLinks.each(function () {
    const $showLink = $(this).find("a.more-info");
    const href = $showLink.attr("href");
    // Sometimes the BFI listings aren't links. If so, there's nothing we can do
    // but skip it and hope they fix the issue in a future run.
    if (!href) return;

    const showUrl = href.split(
      "&BOparam::WScontent::loadArticle::context_id=",
    )[0];
    moviePages[showUrl] = moviePages[showUrl] || {};
    moviePages[showUrl].title = getText($showLink);
  });

  return moviePages;
}

async function retrieve(attributes) {
  const { articleId, url, domain } = attributes;

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

  // Discover the show URLs from the calendar search results ...
  let moviePages = {};
  for (const searchResultPage of movieListPage) {
    moviePages = discoverShows(cheerio.load(searchResultPage), moviePages);
  }

  // ... then load each show's own listing page for its full set of performances.
  console.log(
    `    - [${Date.now()}] Loading ${Object.keys(moviePages).length} show pages ... `,
  );
  for (const showUrl in moviePages) {
    const showData = moviePages[showUrl];
    console.log(
      `    - [${Date.now()}] Getting data for "${showData.title}" ... `,
    );

    const slug = slugify(showData.title, { strict: true }).toLowerCase();
    const showCacheKey = `bfi.org.uk-${getId(showUrl)}-${articleId}-${slug}`;
    const { html, articleContext } = await getShow(
      url,
      showCacheKey,
      domain,
      showUrl,
    );
    showData.html = html;
    showData.articleContext = articleContext;
  }

  return { movieListPage, moviePages };
}

module.exports = retrieve;
