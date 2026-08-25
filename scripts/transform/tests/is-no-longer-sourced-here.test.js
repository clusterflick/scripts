const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const isNoLongerSourcedHere = require("../is-no-longer-sourced-here");

describe("isNoLongerSourcedHere", () => {
  const ealing = { id: "picturehouses.com-ealing" };
  const movie = (showingId, title = "BlackLifted Film Festival") => ({
    showingId,
    title,
  });

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
  it("drops a sourced event the source no longer places at this venue", () => {
    expect(
      isNoLongerSourcedHere(movie("eventbrite.co.uk-1998360243282"), ealing, {
        "eventbrite.co.uk": [],
      }),
    ).toBe(true);
  });

  it("keeps a sourced event the source still places at this venue", () => {
    expect(
      isNoLongerSourcedHere(movie("eventbrite.co.uk-1998360243282"), ealing, {
        "eventbrite.co.uk": [
          { showingId: "eventbrite.co.uk-1998360243282" },
          { showingId: "eventbrite.co.uk-1996329278612" },
        ],
      }),
    ).toBe(false);
  });

  // A source that produced nothing has said nothing about where its screenings
  // are, so the previous release keeps its say.
  it("keeps a sourced event when the source has no data this run", () => {
    process.chdir(withoutRetrievedData);
    try {
      expect(
        isNoLongerSourcedHere(movie("eventbrite.co.uk-1998360243282"), ealing, {
          "eventbrite.co.uk": [],
        }),
      ).toBe(false);
    } finally {
      process.chdir(withRetrievedData);
    }
  });

  // "bbk.ac.uk-central" starts with the "bbk.ac.uk" source's id, so its own
  // showings would otherwise read as sourced ones the source had dropped.
  it("keeps a venue's own showing when the venue id starts with a source id", () => {
    expect(
      isNoLongerSourcedHere(
        movie("bbk.ac.uk-central-12345"),
        { id: "bbk.ac.uk-central" },
        { "bbk.ac.uk": [] },
      ),
    ).toBe(false);
  });

  it("keeps a venue's own showing", () => {
    expect(
      isNoLongerSourcedHere(
        movie("picturehouses.com-ealing-HO00012345"),
        ealing,
        { "eventbrite.co.uk": [] },
      ),
    ).toBe(false);
  });

  it("keeps a showing whose id belongs to no source", () => {
    expect(
      isNoLongerSourcedHere(movie("somewhere.else-12345"), ealing, {
        "eventbrite.co.uk": [],
      }),
    ).toBe(false);
  });
});
