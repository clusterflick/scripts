const { buildRegistry, parseTagDate } = require("../index");

const RELEASE = "20260808.180256";

const present = (entries) => new Map(Object.entries(entries));

const registry = (movies) => ({
  metadata: { release: "20260807.174932" },
  movies,
});

// Hide script output
console.log = () => {};

describe("parseTagDate", () => {
  it("reads the date out of a release tag", () => {
    expect(parseTagDate("20260808.180256")).toBe(Date.UTC(2026, 7, 8));
  });

  it("is null for anything that isn't a release tag", () => {
    expect(parseTagDate("not-a-tag")).toBeNull();
    expect(parseTagDate(undefined)).toBeNull();
  });
});

describe("buildRegistry", () => {
  it("stamps every showing movie with the release tag", () => {
    const result = buildRegistry({
      present: present({ 100: 1754683200000, 200: undefined }),
      release: RELEASE,
    });

    expect(result.movies).toEqual({
      100: { lastSeen: RELEASE, lastPerformance: 1754683200000 },
      200: { lastSeen: RELEASE },
    });
  });

  it("carries forward a movie that has stopped showing", () => {
    const result = buildRegistry({
      present: present({ 100: 1754683200000 }),
      previousRegistry: registry({
        100: { lastSeen: "20260807.174932" },
        200: { lastSeen: "20260805.061345", lastPerformance: 1754400000000 },
      }),
      release: RELEASE,
    });

    expect(result.movies[100].lastSeen).toBe(RELEASE);
    expect(result.movies[200]).toEqual({
      lastSeen: "20260805.061345",
      lastPerformance: 1754400000000,
    });
  });

  it("re-stamps a movie that comes back", () => {
    const result = buildRegistry({
      present: present({ 200: 1754683200000 }),
      previousRegistry: registry({
        200: { lastSeen: "20260101.061345", lastPerformance: 1754400000000 },
      }),
      release: RELEASE,
    });

    expect(result.movies[200].lastSeen).toBe(RELEASE);
  });

  it("keeps the latest performance time ever seen for a movie", () => {
    const result = buildRegistry({
      present: present({ 100: 1754400000000 }),
      previousRegistry: registry({
        100: { lastSeen: "20260807.174932", lastPerformance: 1754683200000 },
      }),
      release: RELEASE,
    });

    expect(result.movies[100].lastPerformance).toBe(1754683200000);
  });

  it("drops entries that have been gone longer than the retention window", () => {
    const result = buildRegistry({
      present: present({}),
      previousRegistry: registry({
        100: { lastSeen: "20260801.055209" },
        200: { lastSeen: "20260701.055209" },
      }),
      release: RELEASE,
      retentionDays: 10,
    });

    expect(Object.keys(result.movies)).toEqual(["100"]);
  });

  it("throws rather than keeping an entry it cannot age", () => {
    expect(() =>
      buildRegistry({
        present: present({}),
        previousRegistry: registry({ 100: { lastSeen: "nonsense" } }),
        release: RELEASE,
      }),
    ).toThrow(/unparseable lastSeen/);
  });

  it("throws on a release tag it cannot read", () => {
    expect(() =>
      buildRegistry({ present: present({}), release: "nonsense" }),
    ).toThrow(/Could not parse a date/);
  });

  // Reruns happen, and a registry that shifted on each one would make the
  // published artifact impossible to compare between releases.
  it("is idempotent when the same release is folded in twice", () => {
    const args = {
      present: present({ 100: 1754683200000 }),
      previousRegistry: registry({ 200: { lastSeen: "20260805.061345" } }),
      release: RELEASE,
    };

    const once = buildRegistry(args);
    const twice = buildRegistry({ ...args, previousRegistry: once });

    expect(twice).toEqual(once);
  });

  it("counts showing and departed movies separately", () => {
    const result = buildRegistry({
      present: present({ 100: undefined, 300: undefined }),
      previousRegistry: registry({ 200: { lastSeen: "20260805.061345" } }),
      release: RELEASE,
    });

    expect(result.metadata).toMatchObject({
      release: RELEASE,
      showingCount: 2,
      departedCount: 1,
    });
  });
});
