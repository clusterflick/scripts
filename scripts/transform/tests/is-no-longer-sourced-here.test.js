const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// The cross-venue lookup asks each source where it places its events this run.
// Stubbing the source and cinema registries keeps that answer in the test
// rather than in whatever happens to be on disk under retrieved-data/.
// Prefixed `mock` so jest's hoisting lets the factories below close over it.
const mockFindEvents = jest.fn();

jest.mock("../../../sources", () => ({
  getAllSourceNames: () => ["bbk.ac.uk", "eventbrite.co.uk"],
  getSourceAttributes: (name) => ({ id: name }),
  getSourceFindEvents: () => mockFindEvents,
}));

jest.mock("../../../cinemas", () => ({
  getAllCinemaAttributes: () => [
    { id: "picturehouses.com-ealing" },
    { id: "actonecinema.co.uk" },
  ],
}));

describe("isNoLongerSourcedHere", () => {
  const ealing = { id: "picturehouses.com-ealing" };
  const acton = { id: "actonecinema.co.uk" };
  const blacklifted = "eventbrite.co.uk-1998360243282";
  const movie = (showingId, title = "BlackLifted Film Festival") => ({
    showingId,
    title,
  });

  // Where the source places its events, keyed by venue id, as findEvents would
  // report it for each cinema in turn.
  const placedAt = (byVenue) => {
    mockFindEvents.mockImplementation(async ({ id }) =>
      (byVenue[id] ?? []).map((showingId) => ({ showingId })),
    );
  };

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

  beforeEach(() => {
    mockFindEvents.mockReset();
    // The union is memoised per source for the life of the process, so each
    // test needs its own module registry to be answered by its own stub.
    jest.resetModules();
  });

  const subject = () => require("../is-no-longer-sourced-here");

  // The BlackLifted Film Festival was listed on Eventbrite at Ealing
  // Picturehouse and then moved to ActOne Cinema, keeping its event id. Ealing
  // stopped matching it, but the Eventbrite page stayed up.
  it("drops a sourced event the source now places at another venue", async () => {
    placedAt({ "actonecinema.co.uk": [blacklifted] });
    await expect(
      subject()(movie(blacklifted), ealing, { "eventbrite.co.uk": [] }),
    ).resolves.toBe(true);
  });

  // The case the guard used to get wrong: a source can run to completion and
  // still omit a venue, and an event that has gone from every venue's results
  // has not been shown to have moved anywhere.
  it("keeps a sourced event the source no longer places anywhere", async () => {
    placedAt({ "actonecinema.co.uk": ["eventbrite.co.uk-1996329278612"] });
    await expect(
      subject()(movie(blacklifted), ealing, { "eventbrite.co.uk": [] }),
    ).resolves.toBe(false);
  });

  it("keeps a sourced event the source still places at this venue", async () => {
    placedAt({ "picturehouses.com-ealing": [blacklifted] });
    await expect(
      subject()(movie(blacklifted), ealing, {
        "eventbrite.co.uk": [
          { showingId: blacklifted },
          { showingId: "eventbrite.co.uk-1996329278612" },
        ],
      }),
    ).resolves.toBe(false);
  });

  // A source that produced nothing has said nothing about where its screenings
  // are, so the previous release keeps its say.
  it("keeps a sourced event when the source has no data this run", async () => {
    placedAt({ "actonecinema.co.uk": [blacklifted] });
    process.chdir(withoutRetrievedData);
    try {
      await expect(
        subject()(movie(blacklifted), ealing, { "eventbrite.co.uk": [] }),
      ).resolves.toBe(false);
    } finally {
      process.chdir(withRetrievedData);
    }
  });

  // "bbk.ac.uk-central" starts with the "bbk.ac.uk" source's id, so its own
  // showings would otherwise read as sourced ones the source had dropped.
  it("keeps a venue's own showing when the venue id starts with a source id", async () => {
    placedAt({});
    await expect(
      subject()(
        movie("bbk.ac.uk-central-12345"),
        { id: "bbk.ac.uk-central" },
        {
          "bbk.ac.uk": [],
        },
      ),
    ).resolves.toBe(false);
  });

  it("keeps a venue's own showing", async () => {
    placedAt({});
    await expect(
      subject()(movie("picturehouses.com-ealing-HO00012345"), ealing, {
        "eventbrite.co.uk": [],
      }),
    ).resolves.toBe(false);
  });

  it("keeps a showing whose id belongs to no source", async () => {
    placedAt({});
    await expect(
      subject()(movie("somewhere.else-12345"), ealing, {
        "eventbrite.co.uk": [],
      }),
    ).resolves.toBe(false);
  });

  it("does not consult the source registry when nothing was dropped here", async () => {
    placedAt({ "actonecinema.co.uk": [blacklifted] });
    await subject()(movie(blacklifted), acton, {
      "eventbrite.co.uk": [{ showingId: blacklifted }],
    });
    expect(mockFindEvents).not.toHaveBeenCalled();
  });
});
