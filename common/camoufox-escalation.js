const cheerio = require("cheerio");
const { classifyFetchResponse } = require("./bot-challenge");
const { fetchWithRetry } = require("./utils");

// Opting a retrieve into Camoufox for when a site starts refusing plain
// requests. Two shapes, by what the retrieve fetches:
//
// - `getPageEscalating`, for a retrieve that reads pages: each one is tried
//   with a plain fetch and the session escalates to the browser at the first
//   refusal. Close-Up and JW3.
// - `retryThroughCamoufox`, for a retrieve built on a transport: the whole
//   retrieve is retried with its calls made from inside a site page. Cineworld,
//   Curzon and Stanley Arts.
//
// Either way the venue still has to say what its real page looks like - a
// selector, or a `settle` - since that is the only thing that tells an
// interstitial served with a 200 apart from the content.

const noPause = async () => {};

// Returns the page HTML, or null to escalate the session to the browser - see
// `withoutBrowser` in `common/get-page-with-camoufox.js`.
//
// Escalates on anything `classifyFetchResponse` calls a refusal, on a redirect
// (only seen with `redirect: "manual"`, which a site whose challenge loops
// without its cookie needs), and on a page without the selector - a challenge
// rendered under a 200 without the usual signals still can't carry it. Any other
// failure (a 404, a 500) throws, because the browser would get the same answer
// and a quiet failure would look like a venue with nothing on.
const fetchWithoutBrowser =
  ({ selector, fetchOptions, pace }) =>
  async (url) => {
    await pace();
    const response = await fetchWithRetry(url, fetchOptions);
    if (response.status >= 300 && response.status < 400) return null;

    const html = await response.text();
    if (classifyFetchResponse(response, html)) return null;
    if (!response.ok) {
      throw new Error(`Unexpected ${response.status} response for ${url}`);
    }
    return cheerio.load(html)(selector).length > 0 ? html : null;
  };

// On a challenged navigation the first document is the interstitial and the
// real one only replaces it once Camoufox has solved the challenge, so the
// selector is what is waited on. Attached rather than visible: the content is
// read as HTML, which the plain-fetch path shows is complete without any
// script. But the selector can appear while the real document is still being
// parsed - `goto` only waited for the interstitial to load - so the load is
// waited for too, or a listing can be read with its later entries missing. The
// browser has already navigated by the time this runs, so it paces the page
// after this one.
//
// `onUnsettled` turns a page that never showed the selector into the caller's
// own kind of error, as in `withSitePage` - a health probe classifies it, so a
// challenge Camoufox couldn't clear is recorded as one rather than a timeout.
const readWithBrowser =
  ({ selector, pace, onUnsettled }) =>
  async (page, response) => {
    try {
      await page.waitForSelector(selector, { state: "attached" });
    } catch (error) {
      if (!onUnsettled) throw error;
      return onUnsettled(page, response, error);
    }
    await page.waitForLoadState("load");
    const content = await page.content();
    await pace();
    return content;
  };

// Fetch `url` through a `withCamoufoxSession` `getPage`, cheaply until the site
// first refuses and through the browser from then on. `selector` is something
// only the real page carries; `pace` is an optional pause before each page
// fetched, for a site that challenges a crawl arriving back to back;
// `onUnsettled` is described at `readWithBrowser`.
const getPageEscalating = (
  getPage,
  url,
  cacheKey,
  { selector, fetchOptions, pace = noPause, onUnsettled },
) => {
  const options = { selector, fetchOptions, pace, onUnsettled };
  return getPage(url, cacheKey, readWithBrowser(options), {
    withoutBrowser: fetchWithoutBrowser(options),
  });
};

// Run `direct`, and `throughBrowser` instead when it fails with an error
// `isRefusal` recognises. Only a refusal: any other failure would fail the same
// way in a browser, so it is thrown as it is.
//
// The retry restarts rather than resumes. Whatever the direct attempt already
// fetched is in the day cache, so the restart only repeats what failed.
const retryThroughCamoufox = async (direct, throughBrowser, { isRefusal }) => {
  try {
    return await direct();
  } catch (error) {
    if (!isRefusal(error)) throw error;

    console.log(
      `    - ${error.message}; retrying through Camoufox, which carries a browser fingerprint and can solve a challenge`,
    );
    return await throughBrowser();
  }
};

module.exports = { getPageEscalating, retryThroughCamoufox };
