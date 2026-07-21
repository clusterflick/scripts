const { sleep } = require("../utils");

// BFI's performance widget paginates at 5 per page by default, but the page size
// is controllable via the URL. We request everything in a single page so we
// never have to page through the widget - and we fail loudly (see the
// total_pages guard below) if a film ever grows past this, rather than silently
// dropping the overflow. The largest run seen so far (The Odyssey on IMAX) is
// ~156 performances, so this has comfortable headroom.
const PAGE_SIZE = 500;

function getShowPage(
  getPageWithPlaywright,
  url,
  cacheKey,
  domain,
  showUrl,
  delayMs,
) {
  return getPageWithPlaywright(url, cacheKey, async (page) => {
    // Pace requests to stay under BFI's burst throttle. This lives inside the
    // cache callback so it only delays on an actual fetch, never a cache hit.
    if (delayMs) await sleep(delayMs);

    // Go to the main page first, let it load, and then get the show page - but
    // ask for every performance in one page rather than the default 5.
    await page.waitForLoadState("domcontentloaded");
    // Calendar-derived show URLs (default.asp?...) already carry a query string;
    // films-index permalinks (article/{slug}) don't - pick the right separator.
    const separator = showUrl.includes("?") ? "&" : "?";
    const pagedShowUrl =
      `${showUrl}${separator}BOset::WScontent::SearchResultsInfo::current_page=1` +
      `&BOset::WScontent::SearchResultsInfo::page_size=${PAGE_SIZE}`;
    const response = await page.goto(`${domain}${pagedShowUrl}`);

    // A broken BFI article renders as a blank page with a hard 500 (the films
    // index lists some of these - e.g. an article mis-linked to the IMAX
    // domain). Skip it by returning null - which the caller drops, and which
    // (unlike throwing) gets cached like any other result, so replay tests read
    // a recording rather than hitting a missing-file error.
    //
    // Match 500 exactly rather than any >= 400: Cloudflare challenge/block pages
    // emit 403/503/429 and origin errors emit 520-527, which are transient and
    // fall through to the content wait / retry below instead of being skipped.
    if (response && response.status() === 500) {
      console.log(`      - Skipping broken article (500): ${domain}${showUrl}`);
      return null;
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

    // Soft error page (a rendered "500 - internal server error") - skip it the
    // same way as the hard 500 above: return null (cached) rather than throw.
    if (await errorLocator.isVisible()) {
      console.log(`      - Skipping broken article (500): ${domain}${showUrl}`);
      return null;
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
// format / blurb) alongside its whole articleContext - or null if the article
// is a broken 500 (skipped inside getShowPage, and cached as such). Any other
// failure retries once after a pause, then throws and fails the run.
async function getShow(
  getPageWithPlaywright,
  url,
  cacheKey,
  domain,
  showUrl,
  delayMs = 0,
) {
  try {
    return await getShowPage(
      getPageWithPlaywright,
      url,
      cacheKey,
      domain,
      showUrl,
      delayMs,
    );
  } catch {
    // A non-500 failure (network, timeout, transient block); 500s are skipped
    // as null inside getShowPage. Pause, retry once, then let it throw.
    console.log(
      `      - First attempt failed to retrieve data for ${domain}${showUrl} -- waiting before trying again...`,
    );
    await sleep(30_000); // Wait 30 seconds
    return await getShowPage(
      getPageWithPlaywright,
      url,
      cacheKey,
      domain,
      showUrl,
      delayMs,
    );
  }
}

module.exports = getShow;
