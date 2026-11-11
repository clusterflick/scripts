const crypto = require("node:crypto");
const {
  fetchJson,
  sleep,
  withJitter,
  withRetry,
} = require("../../common/utils.js");
const { dailyCache } = require("../../common/cache.js");

// Fever's API answers an error with the same `cache-control: public,
// max-age=1800` as a success, so CloudFront keeps a 500 for half an hour and
// hands it to everyone asking for that exact URL. Retrying the URL is then
// pointless: on 11 November 2026 a single 500 for catalogue page 2 voided the
// retrieve, because the two step retries replayed the cached listing page,
// rebuilt byte-for-byte the same URL, and were served the stored error within a
// second each without ever reaching Fever.
//
// The recommendation tracker id is part of that cache key, while Fever's own
// server ignores it - page 2 comes back the same with a made-up id, or one
// that isn't a UUID at all. So each retry asks with a fresh id, which misses
// the stored error and reaches the origin. The first attempt keeps the id the
// listing page gave, which is what Fever's own page sends.
//
// A 500 here is retried because this endpoint is known to serve a transient
// one; it stays permanent everywhere else.
const PLAN_GRID_RETRY_CONFIG = {
  retries: 3,
  delayMs: 5_000,
  backoffFactor: 2,
};
const RETRYABLE_PLAN_GRID_STATUSES = new Set([500]);

/**
 * One page of the catalogue's plan grid, through the daily cache. Only a
 * success is cached, so a failure never pins a later run to the failing id.
 */
function fetchPlanGridPage({ getUrl, trackerId, page, headers, delayMs }) {
  return dailyCache(`feverup-catalogue-page-${page}`, async () => {
    let attempt = 0;
    return withRetry(
      async () => {
        const id = attempt++ === 0 ? trackerId : crypto.randomUUID();
        await sleep(withJitter(delayMs));
        return fetchJson(getUrl(id, page), { headers });
      },
      {
        ...PLAN_GRID_RETRY_CONFIG,
        label: `Fever catalogue page ${page}`,
        shouldRetry: (error) => RETRYABLE_PLAN_GRID_STATUSES.has(error.status),
      },
    );
  });
}

module.exports = fetchPlanGridPage;
