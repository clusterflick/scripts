const cheerio = require("cheerio");
const { format, addYears } = require("date-fns");
const slugify = require("slugify");
const getPageWithPlaywright = require("../get-page-with-playwright");
const { getText, getId, sleep } = require("../utils");

const dateFormat = "yyyy-MM-dd";

function getPageContents(url, cacheKey, domain, showUrl) {
  return getPageWithPlaywright(url, cacheKey, async (page) => {
    // Go to the main page first, let it load, and then get the show page
    await page.waitForLoadState("domcontentloaded");
    await page.goto(`${domain}${showUrl}`);

    // Wait until the page is finished everything
    try {
      await page.waitForLoadState("networkidle");
    } catch {
      // If this fails, it'll be because it timed out. At that point, we
      // might as well keep going and see if the next waitFor passes.
    }

    try {
      const errorLocator = page
        .locator("#content h2")
        .filter({ hasText: /500 - internal server error/i });

      // Check if we're on an error page
      await errorLocator.waitFor({ state: "attached", timeout: 1000 });

      return new Error(`Error page detected - ${getText(await errorLocator)}`);
    } catch {
      // If waitFor times out, no error page was found, continue normally
    }

    // Make sure there's information showing. Not all pages have film info
    // (that we care about), so check for the rich text or media areas too.
    // On some fundraising pages we don't have those, but we may have a list
    // instead which contains audience list XML attributes to match instead.
    try {
      await page
        .locator(".Film-info__information,.Rich-text,.Media,ul[xmlns\\:av]")
        .waitFor({ strict: false });
    } catch {
      // Bail if we can't find the expected information
      return new Error(`Film information not available at ${domain}${showUrl}`);
    }

    // There have been instances where the page contents have been an empty
    // object. Detect this and break the run to retry.
    const content = await page.content();
    if (typeof content !== "string" || content.length === 0) {
      return new Error(`Empty page contents at ${domain}${showUrl}`);
    }

    return content;
  });
}

async function processSearchResultPage(
  { url, domain, articleId },
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

  for (const showUrl in moviePages) {
    const showData = moviePages[showUrl];
    if (showData.html) continue;

    console.log(
      `    - [${Date.now()}] Getting data for "${showData.title}" ... `,
    );

    const slug = slugify(showData.title, { strict: true }).toLowerCase();
    const cacheKey = `bfi.org.uk-${getId(showUrl)}-${articleId}-${slug}`;
    let pageContents = await getPageContents(url, cacheKey, domain, showUrl);
    // If we got an error the first time we tried to get the page contents,
    // wait and then try again.
    if (pageContents instanceof Error) {
      console.log(
        `      - First attempt failed to retrieve data for ${domain}${showUrl} -- waiting before trying again...`,
      );
      await sleep(30_000); // Wait 30 seconds
      pageContents = await getPageContents(url, cacheKey, domain, showUrl);
    }
    // If we still can't get the page contents, fail the run.
    if (pageContents instanceof Error) {
      console.log(
        `      - Unable to retrieve data for "${showData.title}"; error page detected at ${domain}${showUrl}`,
      );
      throw pageContents;
    }

    // Make sure that there's no bugs above where we'll end up saving something
    // that isn't the HTML string
    if (typeof pageContents !== "string") {
      throw new Error(
        `Invalid page contents at ${domain}${showUrl}; expected string, got ${typeof pageContents}`,
      );
    }

    // Additional length check
    if (pageContents.length === 0) {
      throw new Error(`Empty page contents at ${domain}${showUrl}`);
    }

    moviePages[showUrl].html = pageContents;
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
  for (const searchResultPage of movieListPage) {
    moviePages = await processSearchResultPage(
      attributes,
      moviePages,
      searchResultPage,
    );
  }
  return { movieListPage, moviePages };
}

module.exports = retrieve;
