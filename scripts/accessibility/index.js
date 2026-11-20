const {
  getPageText,
  hashText,
} = require("../../common/accessibility/page-text");
const { fetchWithRetry, sanitizePathSegment } = require("../../common/utils");

/**
 * The stored page's file name. A URL is too long and too punctuated to be one,
 * so it's the venue and the URL's hash.
 *
 * @param {string} venueId
 * @param {string} url
 * @returns {string}
 */
const getPageFileName = (venueId, url) =>
  `${sanitizePathSegment(venueId)}--${hashText(url).slice(0, 12)}.json`;

/**
 * Fetch one source page and reduce it to the text facts are checked against.
 *
 * @param {{ url: string, selector?: string }} source
 * @returns {Promise<string>}
 */
async function fetchSourceText({ url, selector }) {
  const response = await fetchWithRetry(url);
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }
  return getPageText(await response.text(), selector);
}

/**
 * Fetch every page in the source registry and say which have changed since the
 * hashes last recorded.
 *
 * A page that fails is recorded as failed and the rest carry on: one venue's
 * site being down says nothing about the others, and the pages that did come
 * back are worth keeping. The caller fails the run afterwards if any did.
 *
 * A changed page sends its venue back for review, since any fact taken from it
 * may no longer hold. A page seen for the first time does too - nothing from it
 * has been checked yet.
 *
 * @param {object} options
 * @param {Record<string, Array<{ url: string, tier: number, selector?: string }>>} options.sources
 *   The source registry
 * @param {Record<string, { hash: string, fetched_on: string }>} [options.previousHashes]
 *   url -> what the last run saw
 * @param {string} options.today - YYYY-MM-DD, London time
 * @param {(source: object) => Promise<string>} [options.fetchText] - For tests
 * @returns {Promise<{
 *   pages: Array<{ venueId: string, url: string, file: string, hash: string, text: string }>,
 *   hashes: Record<string, { hash: string, fetched_on: string }>,
 *   changed: Array<{ venueId: string, url: string, reason: "new" | "changed" }>,
 *   failures: Array<{ venueId: string, url: string, error: string }>,
 * }>}
 */
async function fetchSources({
  sources,
  previousHashes = {},
  today,
  fetchText = fetchSourceText,
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today ?? "")) {
    throw new Error(`Expected today as YYYY-MM-DD, got ${today}`);
  }
  const pages = [];
  const changed = [];
  const failures = [];
  // A failed fetch keeps the last hash, so the next run compares against what
  // was last actually seen rather than treating the page as new.
  const hashes = { ...previousHashes };
  // A page cited by two venues is fetched once.
  const fetched = new Map();

  for (const [venueId, entries] of Object.entries(sources).sort()) {
    for (const source of entries) {
      const key = `${source.url} ${source.selector ?? ""}`;
      if (!fetched.has(key)) {
        fetched.set(
          key,
          fetchText(source).then(
            (text) => ({ text }),
            (error) => ({ error: error.message || String(error) }),
          ),
        );
      }
      const result = await fetched.get(key);
      if (result.error) {
        failures.push({ venueId, url: source.url, error: result.error });
        continue;
      }
      const hash = hashText(result.text);
      const previous = previousHashes[source.url];
      if (!previous) changed.push({ venueId, url: source.url, reason: "new" });
      else if (previous.hash !== hash) {
        changed.push({ venueId, url: source.url, reason: "changed" });
      }
      hashes[source.url] = { hash, fetched_on: today };
      pages.push({
        venueId,
        url: source.url,
        file: getPageFileName(venueId, source.url),
        hash,
        text: result.text,
      });
    }
  }
  return { pages, hashes, changed, failures };
}

module.exports = { fetchSources, fetchSourceText, getPageFileName };
