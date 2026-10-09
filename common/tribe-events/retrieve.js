const cheerio = require("cheerio");
const { fetchWithRetry, fetchError } = require("../utils");
const { isSiteGroundChallengeFetchResponse } = require("../bot-challenge");

// Shared retrieval helpers for venues running the Tribe "The Events Calendar"
// WordPress plugin, which exposes rendered views via a `wp-json` REST endpoint.

// Requests go through a transport so the same walk can be made from inside a
// browser page when a site refuses plain requests - see `./browser.js`, and
// `common/ocapi-v1/retrieve.js` for the same split.
//
// A SiteGround challenge is a 202, which `fetch` counts as ok, so without the
// check it would be parsed as the page and fail later as a missing nonce. It is
// thrown with `siteGroundChallenge` set so a retrieve can tell it apart from
// any other failure and escalate to the browser.
const directTransport = {
  text: async (url) => {
    const response = await fetchWithRetry(url);
    if (isSiteGroundChallengeFetchResponse(response)) {
      const error = fetchError(url, response);
      error.message += " (SiteGround bot challenge)";
      error.siteGroundChallenge = true;
      throw error;
    }
    if (!response.ok) throw fetchError(url, response);
    return response.text();
  },
};

// The plugin embeds a nonce in each page that is required to call its REST view
// endpoint. Returns `{ tvn1, tvn2 }`.
function extractNonce(html) {
  const $ = cheerio.load(html);
  const nonceScript = $("script[data-js='tribe-events-view-nonce-data']");
  if (!nonceScript.length) {
    throw new Error("Could not find Tribe events nonce data in HTML");
  }
  return JSON.parse(nonceScript.html());
}

// Fetch a rendered Tribe view, returning the inner HTML fragment. `params` may
// be a URLSearchParams/object or a pre-encoded query string (some views embed a
// nested, already-encoded `u` query that must not be re-encoded).
async function fetchViewHtml(domain, params, transport = directTransport) {
  const query =
    typeof params === "string" ? params : new URLSearchParams(params);
  const { html } = JSON.parse(
    await transport.text(`${domain}/wp-json/tribe/views/v2/html?${query}`),
  );
  return html;
}

// Walk a paginated list view, fetching each page until one contains no events.
// `buildParams(page, nonce)` returns the query for a given page number.
async function retrievePaginatedListView({
  domain,
  initialPageUrl,
  buildParams,
  maxPages = 20,
  transport = directTransport,
}) {
  const html = await transport.text(initialPageUrl);
  const nonce = extractNonce(html);

  const movieListPages = [];
  let page = 1;
  while (page <= maxPages) {
    const viewHtml = await fetchViewHtml(
      domain,
      buildParams(page, nonce),
      transport,
    );
    if (!viewHtml.includes("application/ld+json")) break;
    movieListPages.push(viewHtml);
    page += 1;
  }

  if (page > maxPages) {
    throw new Error(
      "Exceeded maximum page limit — stopping condition may have changed",
    );
  }

  return { movieListPages };
}

module.exports = { extractNonce, fetchViewHtml, retrievePaginatedListView };
