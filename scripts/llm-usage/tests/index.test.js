const fs = require("node:fs").promises;
const os = require("node:os");
const path = require("node:path");
const { writeJSON } = require("../../../common/utils");
const { loadUsageData, buildUsageReport } = require("../index");

const hit = (cacheKeyPrefix) => ({
  cacheKeyPrefix,
  provider: "gemini",
  model: "gemini-2.5-flash-lite",
  cacheHit: true,
});

const miss = (cacheKeyPrefix, promptTokens = 100, candidatesTokens = 20) => ({
  cacheKeyPrefix,
  provider: "gemini",
  model: "gemini-2.5-flash-lite",
  cacheHit: false,
  promptTokens,
  candidatesTokens,
});

describe("loadUsageData", () => {
  let directory;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "llm-usage-data-"));
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it("keys each file's records by the venue id in its filename", async () => {
    await writeJSON(path.join(directory, "cinema-a"), [miss("ask-llm")]);
    await writeJSON(path.join(directory, "cinema-b"), []);

    const usageByVenue = await loadUsageData(directory);

    expect(Object.keys(usageByVenue)).toEqual(["cinema-a", "cinema-b"]);
    expect(usageByVenue["cinema-a"]).toHaveLength(1);
    expect(usageByVenue["cinema-b"]).toEqual([]);
  });
});

describe("buildUsageReport", () => {
  it("reports zero calls for an empty run", () => {
    const report = buildUsageReport({});

    expect(report.metadata.venueCount).toBe(0);
    expect(report.metadata.venuesWithLlmUsage).toBe(0);
    expect(report.totals).toEqual({
      calls: 0,
      cacheHits: 0,
      cacheMisses: 0,
      promptTokens: 0,
      candidatesTokens: 0,
      estimatedCostUsd: 0,
      cacheHitRate: 0,
    });
    expect(report.byCallSite).toEqual({});
    expect(report.byVenue).toEqual({});
  });

  it("counts venues with no LLM calls towards venueCount but not venuesWithLlmUsage", () => {
    const report = buildUsageReport({ "quiet-cinema": [] });

    expect(report.metadata.venueCount).toBe(1);
    expect(report.metadata.venuesWithLlmUsage).toBe(0);
    expect(report.byVenue).toEqual({});
  });

  it("splits calls into cache hits and misses, with a hit rate", () => {
    const report = buildUsageReport({
      "cinema-a": [hit("ask-llm"), miss("ask-llm"), miss("ask-llm")],
    });

    expect(report.totals.calls).toBe(3);
    expect(report.totals.cacheHits).toBe(1);
    expect(report.totals.cacheMisses).toBe(2);
    expect(report.totals.cacheHitRate).toBeCloseTo(1 / 3, 10);
  });

  it("only counts tokens and cost for cache misses", () => {
    const report = buildUsageReport({
      "cinema-a": [hit("ask-llm"), miss("ask-llm", 1_000_000, 1_000_000)],
    });

    expect(report.totals.promptTokens).toBe(1_000_000);
    expect(report.totals.candidatesTokens).toBe(1_000_000);
    expect(report.totals.estimatedCostUsd).toBeCloseTo(0.1 + 0.4, 10);
  });

  it("breaks totals down by call site", () => {
    const report = buildUsageReport({
      "cinema-a": [miss("ask-llm"), miss("identify-shorts")],
      "cinema-b": [miss("ask-llm")],
    });

    expect(Object.keys(report.byCallSite)).toEqual([
      "ask-llm",
      "identify-shorts",
    ]);
    expect(report.byCallSite["ask-llm"].calls).toBe(2);
    expect(report.byCallSite["identify-shorts"].calls).toBe(1);
  });

  it("breaks totals down by venue, so the heaviest LLM users are visible", () => {
    const report = buildUsageReport({
      "cinema-a": [miss("ask-llm"), miss("ask-llm")],
      "cinema-b": [miss("ask-llm")],
      "cinema-c": [],
    });

    expect(Object.keys(report.byVenue)).toEqual(["cinema-a", "cinema-b"]);
    expect(report.byVenue["cinema-a"].calls).toBe(2);
    expect(report.byVenue["cinema-b"].calls).toBe(1);
  });

  it("flags provider/models with no listed price instead of silently undercounting", () => {
    const report = buildUsageReport({
      "cinema-a": [miss("ask-llm")],
      "cinema-b": [
        {
          cacheKeyPrefix: "ask-llm",
          provider: "gemini",
          model: "gemini-9000",
          cacheHit: false,
          promptTokens: 100,
          candidatesTokens: 20,
        },
      ],
    });

    expect(report.metadata.modelsWithoutPricing).toEqual([
      "gemini:gemini-9000",
    ]);
    // The unpriced call still counts towards calls/tokens, just not cost.
    expect(report.totals.calls).toBe(2);
    expect(report.totals.estimatedCostUsd).toBeCloseTo(
      report.byVenue["cinema-a"].estimatedCostUsd,
      10,
    );
  });
});
