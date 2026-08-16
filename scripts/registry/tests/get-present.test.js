const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { getPresent } = require("..");

const TIME = new Date("2026-08-08T18:00:00Z").getTime();
const HOUR = 60 * 60 * 1000;

// Hide script output
console.log = () => {};

const showing = (overrides = {}) => ({
  showingId: "venue.com-1",
  title: "Fight Club",
  themoviedb: { id: 550 },
  performances: [{ time: TIME }],
  ...overrides,
});

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "registry-test-"));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const writeVenue = (venueId, showings) =>
  fs.writeFileSync(path.join(root, venueId), JSON.stringify(showings));

describe("getPresent", () => {
  it("reads venues and movies in a single pass", async () => {
    writeVenue("a.com", [showing()]);
    writeVenue("b.com", [showing({ themoviedb: { id: 680 } })]);

    const { movies, venues } = await getPresent(root);

    expect([...venues.keys()]).toEqual(["a.com", "b.com"]);
    expect([...movies.keys()]).toEqual(["550", "680"]);
  });

  // Every cinema module writes a file on every run, so file existence would
  // make every venue permanently present and say nothing at all.
  it("does not count a venue whose file has no performances", async () => {
    writeVenue("empty.com", []);
    writeVenue("unscheduled.com", [showing({ performances: [] })]);

    const { venues } = await getPresent(root);

    expect(venues.size).toBe(0);
  });

  // Dormancy is about whether the venue put anything on, not about whether we
  // managed to identify it.
  it("counts a venue's performances whether or not they matched TheMovieDB", async () => {
    writeVenue("a.com", [showing({ themoviedb: undefined })]);

    const { movies, venues } = await getPresent(root);

    expect(venues.get("a.com")).toBe(TIME);
    expect(movies.size).toBe(0);
  });

  it("keeps a venue's latest performance across all of its showings", async () => {
    writeVenue("a.com", [
      showing({ performances: [{ time: TIME }, { time: TIME + HOUR }] }),
      showing({ performances: [{ time: TIME - HOUR }] }),
    ]);

    const { venues } = await getPresent(root);

    expect(venues.get("a.com")).toBe(TIME + HOUR);
  });

  it("skips a file that does not hold a list of showings", async () => {
    writeVenue("broken.com", { error: "retrieve failed" });
    writeVenue("a.com", [showing()]);

    const { venues } = await getPresent(root);

    expect([...venues.keys()]).toEqual(["a.com"]);
  });
});
