const cheerio = require("cheerio");
const { format, addYears } = require("date-fns");
const slugify = require("slugify");
const getPageWithPlaywright = require("../get-page-with-playwright");
const { getText } = require("../utils");

const dateFormat = "yyyy-MM-dd";

async function processSearchResultPage(
  { domain, articleId },
  moviePages,
  html,
) {
  const $ = cheerio.load(html);
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
    moviePages[showUrl] = moviePages[showUrl] || { performances: [] };
    moviePages[showUrl].performances.push($(this).html());
    moviePages[showUrl].title = getText($showLink);
  });

  for (showUrl in moviePages) {
    const showData = moviePages[showUrl];
    if (showData.html) continue;

    console.log(
      `    - [${Date.now()}] Getting data for "${showData.title}" ... `,
    );

    const slug = slugify(showData.title, { strict: true }).toLowerCase();
    const cacheKey = `bfi.org.uk-${articleId}-${slug}`;
    moviePages[showUrl].html = await getPageWithPlaywright(
      `${domain}${showUrl}`,
      cacheKey,
      async (page) => {
        // Wait until the page is finished everything
        try {
          await page.waitForLoadState("networkidle");
        } catch (e) {
          // If this fails, it'll be because it timed out. At that point, we
          // might as well keep going and see if the next waitFor passes.
        }
        // Make sure there's information showing. Not all pages have film info
        // (that we care about), so check for the rich text or media areas too
        try {
          await page
            .locator(".Film-info__information,.Rich-text,.Media")
            .waitFor({ strict: false });
        } catch (error) {
          console.error(`Page data not available at ${domain}${showUrl}`);
          throw error;
        }

        return await page.content();
      },
    );
  }

  return moviePages;
}

async function retrieve(attributes) {
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
  console.log(`    - [${Date.now()}] Retriving search results pages ... `);

  const cacheKey = `bfi.org.uk-${articleId}`;
  const movieListPage = await getPageWithPlaywright(
    `${url}?${urlQuery.join("&")}`,
    cacheKey,
    async (page) => {
      const pages = [];
      while (true) {
        // Wait until the page is finished everything
        try {
          await page.waitForLoadState("networkidle");
        } catch (e) {
          // If this fails, it'll be because it timed out. At that point, we
          // might as well keep going and see if the next waitFor passes.
        }
        // Make sure there's results showing
        await page.locator(".detailed-search-results").waitFor();

        pages.push(await page.content());

        const $nextPageButton = await page.locator("css=#av-next-link");
        if ((await $nextPageButton.count()) > 0) {
          $nextPageButton.click();

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

  console.log(
    `    - [${Date.now()}] Processing ${movieListPage.length} search results pages ... `,
  );
  let moviePages = {};
  for (searchResultPage of movieListPage) {
    moviePages = await processSearchResultPage(
      attributes,
      moviePages,
      searchResultPage,
    );
  }
  return { movieListPage, moviePages };
}

module.exports = retrieve;
