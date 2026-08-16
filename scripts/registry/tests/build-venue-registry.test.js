const { buildVenueRegistry } = require("../index");

const RELEASE = "20260808.180256";

const present = (entries) => new Map(Object.entries(entries));

const registry = (venues) => ({
  metadata: { release: "20260807.174932" },
  venues,
});

// Hide script output
console.log = () => {};

describe("buildVenueRegistry", () => {
  it("stamps every venue that had a performance", () => {
    const result = buildVenueRegistry({
      present: present({ "a.com": 1754683200000, "b.com": 1754400000000 }),
      release: RELEASE,
    });

    expect(result.venues).toEqual({
      "a.com": { lastSeen: RELEASE, lastPerformance: 1754683200000 },
      "b.com": { lastSeen: RELEASE, lastPerformance: 1754400000000 },
    });
  });

  it("carries forward a venue that has gone quiet", () => {
    const result = buildVenueRegistry({
      present: present({ "a.com": 1754683200000 }),
      previousRegistry: registry({
        "a.com": {
          lastSeen: "20260807.174932",
          lastPerformance: 1754400000000,
        },
        "b.com": {
          lastSeen: "20260805.061345",
          lastPerformance: 1754400000000,
        },
      }),
      release: RELEASE,
    });

    expect(result.venues["a.com"].lastSeen).toBe(RELEASE);
    expect(result.venues["b.com"]).toEqual({
      lastSeen: "20260805.061345",
      lastPerformance: 1754400000000,
    });
  });

  // The window exists to say a venue has been quiet for a long time, so the
  // oldest entries are the ones worth keeping.
  it("never prunes, however long a venue has been quiet", () => {
    const result = buildVenueRegistry({
      present: present({}),
      previousRegistry: registry({
        "a.com": {
          lastSeen: "20200101.055209",
          lastPerformance: 1577836800000,
        },
      }),
      release: RELEASE,
    });

    expect(result.venues["a.com"].lastSeen).toBe("20200101.055209");
  });

  it("keeps the latest performance time ever seen for a venue", () => {
    const result = buildVenueRegistry({
      present: present({ "a.com": 1754400000000 }),
      previousRegistry: registry({
        "a.com": {
          lastSeen: "20260807.174932",
          lastPerformance: 1754683200000,
        },
      }),
      release: RELEASE,
    });

    expect(result.venues["a.com"].lastPerformance).toBe(1754683200000);
  });

  // What lets a backfill fold historical releases in any order, and lets a bad
  // seed be re-run over its own output.
  it("does not walk lastSeen backwards when an older release is folded in", () => {
    const result = buildVenueRegistry({
      present: present({ "a.com": 1754400000000 }),
      previousRegistry: registry({
        "a.com": {
          lastSeen: "20260807.174932",
          lastPerformance: 1754683200000,
        },
      }),
      release: "20260101.061345",
    });

    expect(result.venues["a.com"]).toEqual({
      lastSeen: "20260807.174932",
      lastPerformance: 1754683200000,
    });
  });

  it("gives a venue that has never had a performance no entry at all", () => {
    const result = buildVenueRegistry({
      present: present({ "a.com": 1754683200000 }),
      release: RELEASE,
    });

    expect(result.venues["b.com"]).toBeUndefined();
  });

  it("throws on a release tag it cannot read", () => {
    expect(() =>
      buildVenueRegistry({ present: present({}), release: "nonsense" }),
    ).toThrow(/Could not parse a date/);
  });

  // Reruns happen, and a registry that shifted on each one would make the
  // published artifact impossible to compare between releases.
  it("is idempotent when the same release is folded in twice", () => {
    const args = {
      present: present({ "a.com": 1754683200000 }),
      previousRegistry: registry({
        "b.com": {
          lastSeen: "20260805.061345",
          lastPerformance: 1754400000000,
        },
      }),
      release: RELEASE,
    };

    const once = buildVenueRegistry(args);
    const twice = buildVenueRegistry({ ...args, previousRegistry: once });

    expect(twice).toEqual(once);
  });

  it("counts active and dormant venues separately", () => {
    const result = buildVenueRegistry({
      present: present({ "a.com": 1754683200000, "c.com": 1754683200000 }),
      previousRegistry: registry({
        "b.com": {
          lastSeen: "20260805.061345",
          lastPerformance: 1754400000000,
        },
      }),
      release: RELEASE,
    });

    expect(result.metadata).toMatchObject({
      release: RELEASE,
      activeCount: 2,
      dormantCount: 1,
    });
  });
});
