const fs = require("node:fs").promises;
const path = require("node:path");
const { readJSON } = require("../../common/utils");
const { estimateCostUsd } = require("../../common/llm-pricing");

/**
 * Load every llm-usage-data venue file in a directory, keyed by venue id (the
 * file name - the transform action writes one file per `transform <location>`
 * run, empty array or not, mirroring how transformed-data is laid out).
 *
 * @param {string} directory
 * @returns {Promise<Object<string, Array<object>>>}
 */
async function loadUsageData(directory) {
  const venues = {};
  for (const file of (await fs.readdir(directory)).sort()) {
    venues[file] = await readJSON(path.join(directory, file));
  }
  return venues;
}

function emptyBucket() {
  return {
    calls: 0,
    cacheHits: 0,
    cacheMisses: 0,
    promptTokens: 0,
    candidatesTokens: 0,
    estimatedCostUsd: 0,
  };
}

// Resolve everything a record contributes to a bucket once per record, rather
// than once per bucket it's added to (totals, its call site, its venue).
function resolveRecordContribution(record) {
  if (record.cacheHit) return { cacheHit: true };

  const promptTokens = record.promptTokens ?? 0;
  const candidatesTokens = record.candidatesTokens ?? 0;
  const cost = estimateCostUsd(
    record.provider,
    record.model,
    promptTokens,
    candidatesTokens,
  );

  return {
    cacheHit: false,
    promptTokens,
    candidatesTokens,
    cost,
    unpriced: cost === undefined ? `${record.provider}:${record.model}` : null,
  };
}

function addContributionToBucket(bucket, contribution) {
  bucket.calls++;
  if (contribution.cacheHit) {
    bucket.cacheHits++;
    return;
  }

  bucket.cacheMisses++;
  bucket.promptTokens += contribution.promptTokens;
  bucket.candidatesTokens += contribution.candidatesTokens;
  bucket.estimatedCostUsd += contribution.cost ?? 0;
}

function withCacheHitRate(bucket) {
  return {
    ...bucket,
    cacheHitRate: bucket.calls > 0 ? bucket.cacheHits / bucket.calls : 0,
  };
}

/**
 * Aggregate one day's llm-usage-data (every venue's per-call records, from
 * loadUsageData) into a single report: how often the pipeline reached for the
 * LLM, how much of that was served from the daily cache, and where the
 * uncached calls came from - by call site (which stage) and by venue (which
 * listings needed it).
 *
 * Deliberately kept separate from transformed-data / combined-data: nothing
 * that reads cinema listings should carry this, so it is published as its own
 * artifact and never merged into the pipeline's data output.
 *
 * @param {Object<string, Array<object>>} usageByVenue - Output of loadUsageData
 * @returns {object} The report to publish
 */
function buildUsageReport(usageByVenue) {
  const totals = emptyBucket();
  const byCallSite = {};
  const byVenue = {};
  const modelsWithoutPricing = new Set();

  for (const [venueId, records] of Object.entries(usageByVenue)) {
    if (records.length === 0) continue;

    const venueBucket = emptyBucket();
    for (const record of records) {
      const contribution = resolveRecordContribution(record);
      if (contribution.unpriced)
        modelsWithoutPricing.add(contribution.unpriced);

      addContributionToBucket(totals, contribution);
      byCallSite[record.cacheKeyPrefix] ??= emptyBucket();
      addContributionToBucket(byCallSite[record.cacheKeyPrefix], contribution);
      addContributionToBucket(venueBucket, contribution);
    }
    byVenue[venueId] = withCacheHitRate(venueBucket);
  }

  return {
    metadata: {
      venueCount: Object.keys(usageByVenue).length,
      venuesWithLlmUsage: Object.keys(byVenue).length,
      // Present when a call used a provider/model this codebase has no listed
      // price for (see common/llm-pricing.js) - estimatedCostUsd undercounts
      // by whatever those calls cost until the pricing table is updated.
      ...(modelsWithoutPricing.size > 0 && {
        modelsWithoutPricing: [...modelsWithoutPricing].sort(),
      }),
    },
    totals: withCacheHitRate(totals),
    byCallSite: Object.fromEntries(
      Object.entries(byCallSite)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([prefix, bucket]) => [prefix, withCacheHitRate(bucket)]),
    ),
    byVenue: Object.fromEntries(
      Object.entries(byVenue).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}

module.exports = { loadUsageData, buildUsageReport };
