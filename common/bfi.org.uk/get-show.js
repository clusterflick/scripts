const getPageWithPlaywright = require("../get-page-with-playwright");
const { sleep } = require("../utils");

// BFI's performance widget paginates at 5 per page by default, but the page size
// is controllable via the URL. We request everything in a single page so we
// never have to page through the widget - and we fail loudly (see the
// total_pages guard below) if a film ever grows past this, rather than silently
// dropping the overflow. The largest run seen so far (The Odyssey on IMAX) is
// ~156 performances, so this has comfortable headroom.
const PAGE_SIZE = 500;

function getShowPage(url, cacheKey, domain, showUrl) {
  return getPageWithPlaywright(url, cacheKey, async (page) => {
    // Go to the main page first, let it load, and then get the show page - but
    // ask for every performance in one page rather than the default 5.
    await page.waitForLoadState("domcontentloaded");
    const pagedShowUrl =
      `${showUrl}&BOset::WScontent::SearchResultsInfo::current_page=1` +
      `&BOset::WScontent::SearchResultsInfo::page_size=${PAGE_SIZE}`;
    const response = await page.goto(`${domain}${pagedShowUrl}`);

    // A broken BFI article renders as a blank page with a hard 500 and none of
    // the content or soft-error text we look for below, so the locator race
    // would just time out after 90s and throw an unrecoverable error. Detect it
    // from the response status instead.
    //
    // Match 500 exactly rather than any >= 400: Cloudflare challenge/block pages
    // emit 403/503/429 and origin errors emit 520-527, all of which are
    // transient and should fall through to the normal retry.
    if (response && response.status() === 500) {
      return new Error(
        `Error page detected - HTTP ${response.status()} at ${domain}${showUrl}`,
      );
    }

    // Wait until the page is finished everything
    try {
      await page.waitForLoadState("networkidle");
    } catch {
      // If this fails, it'll be because it timed out. At that point, we
      // might as well keep going and see if the next waitFor passes.
    }

    // Race between error page and valid content - whichever appears first wins.
    // Not all pages have film info (that we care about), so check for the rich
    // text or media areas too. On some fundraising pages we don't have those,
    // but we may have a list which contains audience list XML attributes.
    const errorLocator = page
      .locator("#content h2")
      .filter({ hasText: /500 - internal server error/i });
    const validContentLocator = page.locator(
      ".Film-info__information,.Rich-text,.Media,ul[xmlns\\:av]",
    );

    await errorLocator
      .or(validContentLocator.first())
      .waitFor({ state: "attached" });

    // Check if we hit an error page
    if (await errorLocator.isVisible()) {
      const errorText = await errorLocator.textContent();
      return new Error(`Error page detected - ${errorText}`);
    }

    // Check if we found valid content
    if (!(await validContentLocator.first().isVisible())) {
      return new Error(`Film information not available at ${domain}${showUrl}`);
    }

    // There have been instances where the page contents have been an empty
    // object. Detect this and break the run to retry.
    const html = await page.content();
    if (typeof html !== "string" || html.length === 0) {
      return new Error(`Empty page contents at ${domain}${showUrl}`);
    }

    // Everything about the listing - performances (`searchResults`), the field
    // mapping (`searchNames`), pagination, etc. - lives in the embedded
    // `articleContext` object, scoped to this article. Capture it whole and let
    // transform decide what matters, minus the session token which we don't want
    // to persist into recordings.
    const articleContext = await page.evaluate(() => {
      /* global window */
      if (!window.articleContext) return null;
      const context = { ...window.articleContext };
      delete context.sToken;
      return context;
    });

    // A valid film page always embeds `articleContext`; its absence means the
    // page rendered in some unexpected shape, so fail loudly rather than treat
    // it as a film with no performances.
    if (!articleContext) {
      return new Error(`No articleContext found at ${domain}${showUrl}`);
    }

    // Completeness guard (a fetch-integrity check, not interpretation): with
    // page_size above every real film's performance count, everything should
    // come back in a single page. More than one page means a film has outgrown
    // PAGE_SIZE and we'd be silently dropping the overflow - fail loudly so it
    // gets raised rather than papered over. An article with no performances has
    // no `pagination` at all, which is a legitimate empty result, not a
    // truncation.
    const totalPages = articleContext.pagination?.total_pages;
    if (Number(totalPages) > 1) {
      return new Error(
        `BFI returned total_pages=${totalPages} at page_size=${PAGE_SIZE} for ${domain}${showUrl} - a single film has outgrown the request size; raise PAGE_SIZE in common/bfi.org.uk/get-show.js`,
      );
    }

    return { html, articleContext };
  });
}

// Load a single show's listing page, returning its article HTML (for overview /
// format / blurb) alongside its full, structured set of performances. Retries
// once after a pause on failure, then throws - a listing page that still fails
// (including a 500) fails the run rather than being skipped.
async function getShow(url, cacheKey, domain, showUrl) {
  try {
    return await getShowPage(url, cacheKey, domain, showUrl);
  } catch {
    console.log(
      `      - First attempt failed to retrieve data for ${domain}${showUrl} -- waiting before trying again...`,
    );
    await sleep(30_000); // Wait 30 seconds
    return await getShowPage(url, cacheKey, domain, showUrl);
  }
}

module.exports = getShow;
