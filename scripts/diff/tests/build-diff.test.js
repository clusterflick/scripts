const {
  hasChanges,
  computeSummary,
  buildPublishedDiff,
} = require("../build-diff");

const venueDiff = (overrides = {}) => ({
  name: "A Venue",
  venueAdded: false,
  venueRemoved: false,
  venueEmpty: false,
  showings: { added: [], removed: [], modified: [] },
  futurePerformances: {
    previousTotal: 0,
    added: 0,
    removed: 0,
    rescheduled: 0,
  },
  tmdbChanges: [],
  ...overrides,
});

const comparison = (venues) => ({
  metadata: {
    currentRelease: "20260726.031204",
    previousRelease: "20260725.031157",
    diffedAt: "2026-07-26T03:20:11.482Z",
    venueCount: Object.keys(venues).length,
  },
  summary: computeSummary(venues),
  venues,
});

describe("hasChanges", () => {
  it("is false for a venue whose showings all stayed put", () => {
    expect(hasChanges(venueDiff())).toBe(false);
  });

  it("is false when only a sub-tolerance reschedule happened", () => {
    expect(
      hasChanges(
        venueDiff({
          futurePerformances: {
            previousTotal: 4,
            added: 0,
            removed: 0,
            rescheduled: 2,
          },
        }),
      ),
    ).toBe(false);
  });

  it.each([
    ["venueAdded", { venueAdded: true }],
    ["venueRemoved", { venueRemoved: true }],
    ["venueEmpty", { venueEmpty: true }],
    [
      "an added showing",
      { showings: { added: [{}], removed: [], modified: [] } },
    ],
    [
      "a removed showing",
      { showings: { added: [], removed: [{}], modified: [] } },
    ],
    [
      "a modified showing",
      { showings: { added: [], removed: [], modified: [{}] } },
    ],
    ["a TMDB change", { tmdbChanges: [{}] }],
  ])("is true for %s", (_label, overrides) => {
    expect(hasChanges(venueDiff(overrides))).toBe(true);
  });
});

describe("computeSummary", () => {
  it("totals changes across venues, counting every venue compared", () => {
    const summary = computeSummary({
      "a.com": venueDiff({
        showings: { added: [{}, {}], removed: [{}], modified: [] },
        futurePerformances: {
          previousTotal: 10,
          added: 5,
          removed: 2,
          rescheduled: 1,
        },
        tmdbChanges: [
          { single: { type: "gained" } },
          { single: { type: "lost" }, multiple: { type: "changed" } },
        ],
      }),
      "b.com": venueDiff({ venueAdded: true }),
      "c.com": venueDiff({ venueRemoved: true }),
      "d.com": venueDiff({ venueEmpty: true }),
      "e.com": venueDiff(),
    });

    expect(summary).toEqual({
      totalVenues: 5,
      venuesAdded: 1,
      venuesRemoved: 1,
      venuesEmpty: 1,
      showingsAdded: 2,
      showingsRemoved: 1,
      futurePerformancesAdded: 5,
      futurePerformancesRemoved: 2,
      tmdbMatchesGained: 1,
      tmdbMatchesLost: 1,
      tmdbMatchesChanged: 1,
    });
  });
});

describe("buildPublishedDiff", () => {
  it("returns null when no venue changed, so publishing can be skipped", () => {
    expect(
      buildPublishedDiff(
        comparison({ "a.com": venueDiff(), "b.com": venueDiff() }),
      ),
    ).toBeNull();
  });

  it("drops unchanged venues but keeps release-wide totals", () => {
    const result = buildPublishedDiff(
      comparison({
        "a.com": venueDiff({
          showings: {
            added: [{ showingId: "a.com-1" }],
            removed: [],
            modified: [],
          },
        }),
        "b.com": venueDiff(),
      }),
    );

    expect(Object.keys(result.venues)).toEqual(["a.com"]);
    expect(result.summary.totalVenues).toBe(2);
    expect(result.metadata.venueCount).toBe(2);
  });

  it("groups TMDB changes by type", () => {
    const gained = { showingId: "a.com-1", single: { type: "gained" } };
    const lost = {
      showingId: "a.com-2",
      single: { type: "lost" },
      multiple: { type: "changed" },
    };

    const result = buildPublishedDiff(
      comparison({ "a.com": venueDiff({ tmdbChanges: [gained, lost] }) }),
    );

    expect(result.venues["a.com"].tmdbChanges).toEqual({
      gained: [gained],
      lost: [lost],
      changed: [lost],
    });
  });

  it("keeps the venue name and the venue-level flags", () => {
    const result = buildPublishedDiff(
      comparison({
        "a.com": venueDiff({ name: "Prince Charles Cinema", venueEmpty: true }),
      }),
    );

    expect(result.venues["a.com"]).toMatchObject({
      name: "Prince Charles Cinema",
      venueAdded: false,
      venueRemoved: false,
      venueEmpty: true,
    });
  });
});
