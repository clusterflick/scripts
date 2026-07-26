const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { compareReleases } = require("..");

const AS_OF = new Date("2026-07-26T12:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

const showing = (overrides = {}) => ({
  showingId: "venue.com-1",
  title: "Fight Club",
  url: "https://venue.com/fight-club",
  category: "movie",
  overview: { categories: [], directors: [], actors: [] },
  performances: [{ time: AS_OF + DAY }],
  ...overrides,
});

// The venue id is the file name, and has to be one with a cinema module so the
// name lookup resolves; a made-up id would only exercise the fallback.
const VENUE_ID = "princecharlescinema.com";

function writeRelease(root, label, showings) {
  const dir = path.join(root, label);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, VENUE_ID), JSON.stringify(showings));
  return dir;
}

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "diff-test-"));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const compare = (current, previous, overrides = {}) =>
  compareReleases({
    currentDir: writeRelease(root, "current", current),
    previousDir: writeRelease(root, "previous", previous),
    currentTag: "20260726.031204",
    previousTag: "20260725.031157",
    asOf: AS_OF,
    ...overrides,
  });

describe("compareReleases", () => {
  it.each([
    ["missing", undefined],
    ["null", null],
    ["not a number", "2026-07-26T12:00:00Z"],
    ["NaN", NaN],
  ])("refuses to run when asOf is %s", async (_label, asOf) => {
    await expect(compare([showing()], [], { asOf })).rejects.toThrow(
      /No asOf timestamp provided/,
    );
  });

  it("anchors the comparison to asOf rather than the wall clock", async () => {
    // A showing whose only performance sits between the two anchors: still to
    // come at the earlier one, already past at the later one.
    const between = showing({ performances: [{ time: AS_OF + DAY }] });

    const atRelease = await compareReleases({
      currentDir: writeRelease(root, "current", []),
      previousDir: writeRelease(root, "previous", [between]),
      currentTag: "a",
      previousTag: "b",
      asOf: AS_OF,
    });
    const twoDaysLater = await compareReleases({
      currentDir: path.join(root, "current"),
      previousDir: path.join(root, "previous"),
      currentTag: "a",
      previousTag: "b",
      asOf: AS_OF + 2 * DAY,
    });

    // Anchored correctly, the removal is reported; anchored late, it vanishes —
    // which is exactly what a retry or a backfill would silently lose.
    expect(atRelease.venues[VENUE_ID].showings.removed).toHaveLength(1);
    expect(twoDaysLater.venues[VENUE_ID].showings.removed).toHaveLength(0);
  });

  it("produces an identical result when run again with the same inputs", async () => {
    const current = [showing({ performances: [{ time: AS_OF + DAY }] })];
    const previous = [];

    const first = await compare(current, previous);
    const second = await compare(current, previous);

    expect(JSON.stringify(second)).toEqual(JSON.stringify(first));
  });

  it("records the anchor, not the run time, in the metadata", async () => {
    const { metadata } = await compare([showing()], []);

    expect(metadata).toEqual({
      currentRelease: "20260726.031204",
      previousRelease: "20260725.031157",
      asOf: "2026-07-26T12:00:00.000Z",
      venueCount: 1,
    });
  });

  it("resolves the venue name from its cinema module", async () => {
    const { venues } = await compare([showing()], []);

    expect(venues[VENUE_ID].name).toBe("Prince Charles Cinema");
  });
});
