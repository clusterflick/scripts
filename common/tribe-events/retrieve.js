const cheerio = require("cheerio");
const { fetchText, fetchJson } = require("../utils");

// Shared retrieval helpers for venues running the Tribe "The Events Calendar"
// WordPress plugin, which exposes rendered views via a `wp-json` REST endpoint.

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
async function fetchViewHtml(domain, params) {
  const query =
    typeof params === "string" ? params : new URLSearchParams(params);
  const { html } = await fetchJson(
    `${domain}/wp-json/tribe/views/v2/html?${query}`,
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
}) {
  const html = await fetchText(initialPageUrl);
  const nonce = extractNonce(html);

  const movieListPages = [];
  let page = 1;
  while (page <= maxPages) {
    const viewHtml = await fetchViewHtml(domain, buildParams(page, nonce));
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
