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
    promptChars: 0,
    maxPromptChars: 0,
  };
}

// Resolve everything a record contributes to a bucket once per record, rather
// than once per bucket it's added to (totals, its call site, its venue).
function resolveRecordContribution(record) {
  // Known before the cache is even consulted, so tracked on hits too - a
  // large prompt costs nothing on a hit, but flags listings that will cost
  // real tokens the day the cache expires.
  const promptChars = record.promptChars ?? 0;

  if (record.cacheHit) return { cacheHit: true, promptChars };

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
    promptChars,
    promptTokens,
    candidatesTokens,
    cost,
    unpriced: cost === undefined ? `${record.provider}:${record.model}` : null,
  };
}

function addContributionToBucket(bucket, contribution) {
  bucket.calls++;
  bucket.promptChars += contribution.promptChars;
  bucket.maxPromptChars = Math.max(
    bucket.maxPromptChars,
    contribution.promptChars,
  );

  if (contribution.cacheHit) {
    bucket.cacheHits++;
    return;
  }

  bucket.cacheMisses++;
  bucket.promptTokens += contribution.promptTokens;
  bucket.candidatesTokens += contribution.candidatesTokens;
  bucket.estimatedCostUsd += contribution.cost ?? 0;
}

function withDerivedStats(bucket) {
  return {
    ...bucket,
    cacheHitRate: bucket.calls > 0 ? bucket.cacheHits / bucket.calls : 0,
    avgPromptChars: bucket.calls > 0 ? bucket.promptChars / bucket.calls : 0,
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
    byVenue[venueId] = withDerivedStats(venueBucket);
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
    totals: withDerivedStats(totals),
    byCallSite: Object.fromEntries(
      Object.entries(byCallSite)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([prefix, bucket]) => [prefix, withDerivedStats(bucket)]),
    ),
    byVenue: Object.fromEntries(
      Object.entries(byVenue).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}

const formatUsd = (amount) => `$${amount.toFixed(4)}`;
const formatPercent = (fraction) => `${Math.round(fraction * 100)}%`;

// The entries (call sites or venues) worth calling out in the summary: those
// that actually cost something, ranked by cost, capped so the summary stays
// short regardless of how many call sites or venues a report covers.
function topByCost(bucketsByKey, limit = 5) {
  return Object.entries(bucketsByKey)
    .filter(([, bucket]) => bucket.estimatedCostUsd > 0)
    .sort(([, a], [, b]) => b.estimatedCostUsd - a.estimatedCostUsd)
    .slice(0, limit);
}

function formatRanked(bucketsByKey) {
  const ranked = topByCost(bucketsByKey);
  if (ranked.length === 0) return "  (none)";

  return ranked
    .map(
      ([key, bucket]) =>
        `  - ${key}: ${formatUsd(bucket.estimatedCostUsd)} (${bucket.cacheMisses} uncached calls, ${formatPercent(bucket.cacheHitRate)} cache hit rate, avg ${Math.round(bucket.avgPromptChars)} prompt chars)`,
    )
    .join("\n");
}

/**
 * A short, human-readable digest of a report from buildUsageReport - the
 * headline numbers plus the call sites and venues driving the cost, so
 * reading it doesn't require opening the JSON.
 *
 * @param {object} report - Output of buildUsageReport
 * @returns {string}
 */
function buildUsageSummary(report) {
  const { metadata, totals } = report;

  const lines = [
    "LLM usage report",
    `${totals.calls} calls across ${metadata.venuesWithLlmUsage}/${metadata.venueCount} venues, ` +
      `${formatPercent(totals.cacheHitRate)} cache hit rate, ${formatUsd(totals.estimatedCostUsd)} estimated`,
  ];

  if (metadata.modelsWithoutPricing) {
    lines.push(
      `⚠ No listed price for: ${metadata.modelsWithoutPricing.join(", ")} - estimated cost excludes these calls`,
    );
  }

  lines.push("", "Top call sites by cost:", formatRanked(report.byCallSite));
  lines.push("", "Top venues by cost:", formatRanked(report.byVenue));

  return lines.join("\n");
}

module.exports = { loadUsageData, buildUsageReport, buildUsageSummary };
