const { buildRegistry, mergeBackfill } = require("../index");
const { silenceConsoleLog } = require("../../../common/test-utils");

const RELEASE = "20261118.052034";

const registry = (movies, metadata = {}) => ({
  metadata: {
    release: RELEASE,
    retentionDays: 365,
    showingCount: 1,
    departedCount: Object.keys(movies).length - 1,
    ...metadata,
  },
  movies,
});

const backfill = (movies) => ({
  metadata: { release: "20260809.180000" },
  movies,
});

silenceConsoleLog();

describe("mergeBackfill", () => {
  it("adds a film the registry has never seen", () => {
    const { registry: result, added } = mergeBackfill({
      registry: registry({ 100: { lastSeen: RELEASE } }),
      backfill: backfill({
        200: { lastSeen: "20260601.060000", lastPerformance: 1780000000000 },
      }),
    });

    expect(added).toBe(1);
    expect(result.movies[200]).toEqual({
      lastSeen: "20260601.060000",
      lastPerformance: 1780000000000,
    });
  });

  // The reason the backfill is folded separately rather than over the
  // registry: buildRegistry would stamp the older release over this one.
  it("keeps the registry's later lastSeen for a film in both", () => {
    const { registry: result, added } = mergeBackfill({
      registry: registry({ 100: { lastSeen: RELEASE } }),
      backfill: backfill({ 100: { lastSeen: "20260601.060000" } }),
    });

    expect(added).toBe(0);
    expect(result.movies[100]).toEqual({ lastSeen: RELEASE });
  });

  it("takes the later lastPerformance for a film in both", () => {
    const { registry: result, improved } = mergeBackfill({
      registry: registry({
        100: { lastSeen: RELEASE, lastPerformance: 1770000000000 },
      }),
      backfill: backfill({
        100: { lastSeen: "20260601.060000", lastPerformance: 1780000000000 },
      }),
    });

    expect(improved).toBe(1);
    expect(result.movies[100]).toEqual({
      lastSeen: RELEASE,
      lastPerformance: 1780000000000,
    });
  });

  it("leaves a film alone when the backfill knows no later performance", () => {
    const { registry: result, improved } = mergeBackfill({
      registry: registry({
        100: { lastSeen: RELEASE, lastPerformance: 1780000000000 },
      }),
      backfill: backfill({ 100: { lastSeen: "20260601.060000" } }),
    });

    expect(improved).toBe(0);
    expect(result.movies[100]).toEqual({
      lastSeen: RELEASE,
      lastPerformance: 1780000000000,
    });
  });

  // The next daily fold would prune it again.
  it("drops a film last seen outside the retention window", () => {
    const { registry: result, expired } = mergeBackfill({
      registry: registry({ 100: { lastSeen: RELEASE } }),
      backfill: backfill({ 200: { lastSeen: "20251001.060000" } }),
    });

    expect(expired).toBe(1);
    expect(result.movies).not.toHaveProperty("200");
  });

  it("keeps the registry's metadata, with the departed count updated", () => {
    const { registry: result } = mergeBackfill({
      registry: registry({ 100: { lastSeen: RELEASE } }),
      backfill: backfill({
        200: { lastSeen: "20260601.060000" },
        300: { lastSeen: "20260701.060000" },
      }),
    });

    expect(result.metadata).toEqual({
      release: RELEASE,
      retentionDays: 365,
      showingCount: 1,
      departedCount: 2,
    });
  });

  it("sorts the movies by id, as buildRegistry does", () => {
    const { registry: result } = mergeBackfill({
      registry: registry({ 300: { lastSeen: RELEASE } }),
      backfill: backfill({
        1000: { lastSeen: "20260601.060000" },
        20: { lastSeen: "20260601.060000" },
      }),
    });

    expect(Object.keys(result.movies)).toEqual(["20", "300", "1000"]);
  });

  it("throws on a backfilled entry seen after the registry's release", () => {
    expect(() =>
      mergeBackfill({
        registry: registry({ 100: { lastSeen: RELEASE } }),
        backfill: backfill({ 200: { lastSeen: "20261201.060000" } }),
      }),
    ).toThrow(/after the registry's own release/);
  });

  it("throws on a backfilled entry with an unreadable lastSeen", () => {
    expect(() =>
      mergeBackfill({
        registry: registry({ 100: { lastSeen: RELEASE } }),
        backfill: backfill({ 200: { lastSeen: "yesterday" } }),
      }),
    ).toThrow(/unparseable lastSeen/);
  });

  it("throws on a registry without a release to measure retention from", () => {
    expect(() =>
      mergeBackfill({
        registry: { metadata: {}, movies: {} },
        backfill: backfill({}),
      }),
    ).toThrow(/release tag/);
  });

  // The two steps together, as the helper runs them: the backfill folded from
  // older releases, then merged, gives what a registry that had existed all
  // along would hold for the films that departed.
  it("matches a registry folded over every release, for departed films", () => {
    const older = [
      ["20260601.060000", { 200: 1780000000000, 300: 1781000000000 }],
      ["20260701.060000", { 300: 1782000000000 }],
    ];
    const newer = [[RELEASE, { 100: 1790000000000 }]];
    const fold = (releases, start) =>
      releases.reduce(
        (previousRegistry, [release, present]) =>
          buildRegistry({
            present: new Map(Object.entries(present)),
            previousRegistry,
            release,
          }),
        start,
      );

    const allAlong = fold([...older, ...newer]);
    const { registry: merged } = mergeBackfill({
      registry: fold(newer),
      backfill: fold(older),
    });

    expect(merged.movies).toEqual(allAlong.movies);
    expect(merged.metadata.departedCount).toBe(allAlong.metadata.departedCount);
  });
});
