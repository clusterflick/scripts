const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Stubbing the source registry keeps which sources exist in the test rather
// than in whatever is under sources/.
jest.mock("../../../sources", () => ({
  getAllSourceNames: () => ["bbk.ac.uk", "eventbrite.co.uk"],
  getSourceAttributes: (name) => ({ id: name }),
}));

const isNoLongerSourcedHere = require("../is-no-longer-sourced-here");

describe("isNoLongerSourcedHere", () => {
  const ealing = { id: "picturehouses.com-ealing" };
  const blacklifted = "eventbrite.co.uk-1998360243282";
  const movie = (showingId, title = "BlackLifted Film Festival") => ({
    showingId,
    title,
  });

  // Every showing id each source places at any venue this run, as
  // `transform-prepare` builds it.
  const placed = (bySource) =>
    new Map(
      Object.entries(bySource).map(([source, ids]) => [source, new Set(ids)]),
    );

  // Whether a source spoke this run is read off the retrieved data on disk, so
  // the tests run from a directory holding the sources they talk about.
  const originalCwd = process.cwd();
  let withRetrievedData;
  let withoutRetrievedData;

  beforeAll(() => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "is-no-longer-sourced-here-"),
    );
    withRetrievedData = path.join(root, "with");
    withoutRetrievedData = path.join(root, "without");
    fs.mkdirSync(path.join(withRetrievedData, "retrieved-data"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(withoutRetrievedData, "retrieved-data"), {
      recursive: true,
    });
    for (const source of ["eventbrite.co.uk", "bbk.ac.uk"]) {
      fs.writeFileSync(
        path.join(withRetrievedData, "retrieved-data", source),
        "{}",
      );
    }
    process.chdir(withRetrievedData);
  });

  afterAll(() => {
    process.chdir(originalCwd);
  });

  // The BlackLifted Film Festival was listed on Eventbrite at Ealing
  // Picturehouse and then moved to ActOne Cinema, keeping its event id. Ealing
  // stopped matching it, but the Eventbrite page stayed up.
  it("drops a sourced event the source now places at another venue", () => {
    expect(
      isNoLongerSourcedHere(
        movie(blacklifted),
        ealing,
        { "eventbrite.co.uk": [] },
        placed({ "eventbrite.co.uk": [blacklifted], "bbk.ac.uk": [] }),
      ),
    ).toBe(true);
  });

  // The case the guard used to get wrong: a source can run to completion and
  // still omit a venue, and an event that has gone from every venue's results
  // has not been shown to have moved anywhere.
  it("keeps a sourced event the source no longer places anywhere", () => {
    expect(
      isNoLongerSourcedHere(
        movie(blacklifted),
        ealing,
        { "eventbrite.co.uk": [] },
        placed({
          "eventbrite.co.uk": ["eventbrite.co.uk-1996329278612"],
          "bbk.ac.uk": [],
        }),
      ),
    ).toBe(false);
  });

  it("keeps a sourced event the source still places at this venue", () => {
    expect(
      isNoLongerSourcedHere(
        movie(blacklifted),
        ealing,
        {
          "eventbrite.co.uk": [
            { showingId: blacklifted },
            { showingId: "eventbrite.co.uk-1996329278612" },
          ],
        },
        placed({ "eventbrite.co.uk": [blacklifted], "bbk.ac.uk": [] }),
      ),
    ).toBe(false);
  });

  // A source that produced nothing has said nothing about where its screenings
  // are, so the previous release keeps its say. Prepared from the same data,
  // it has no placed ids either, and that is not an error.
  it("keeps a sourced event when the source has no data this run", () => {
    process.chdir(withoutRetrievedData);
    try {
      expect(
        isNoLongerSourcedHere(
          movie(blacklifted),
          ealing,
          { "eventbrite.co.uk": [] },
          placed({}),
        ),
      ).toBe(false);
    } finally {
      process.chdir(withRetrievedData);
    }
  });

  // A source with data this run is always swept, so a missing entry means the
  // inputs were prepared from different retrieved data. Reading that as "not
  // placed anywhere" would quietly bring back a screening that had moved.
  it("throws when a source with data this run has no placed ids", () => {
    expect(() =>
      isNoLongerSourcedHere(
        movie(blacklifted),
        ealing,
        { "eventbrite.co.uk": [] },
        placed({ "bbk.ac.uk": [] }),
      ),
    ).toThrow(/No placed showing ids for eventbrite.co.uk/);
  });

  // "bbk.ac.uk-central" starts with the "bbk.ac.uk" source's id, so its own
  // showings would otherwise read as sourced ones the source had dropped.
  it("keeps a venue's own showing when the venue id starts with a source id", () => {
    expect(
      isNoLongerSourcedHere(
        movie("bbk.ac.uk-central-12345"),
        { id: "bbk.ac.uk-central" },
        { "bbk.ac.uk": [] },
        placed({ "bbk.ac.uk": ["bbk.ac.uk-central-12345"] }),
      ),
    ).toBe(false);
  });

  it("keeps a venue's own showing", () => {
    expect(
      isNoLongerSourcedHere(
        movie("picturehouses.com-ealing-HO00012345"),
        ealing,
        { "eventbrite.co.uk": [] },
        placed({}),
      ),
    ).toBe(false);
  });

  it("keeps a showing whose id belongs to no source", () => {
    expect(
      isNoLongerSourcedHere(
        movie("somewhere.else-12345"),
        ealing,
        { "eventbrite.co.uk": [] },
        placed({}),
      ),
    ).toBe(false);
  });
});
