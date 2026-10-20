const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const v8 = require("node:v8");
const { readTransformInputs } = require("../transform-inputs");

describe("readTransformInputs", () => {
  const originalCwd = process.cwd();
  let inputs;

  // What `transform-prepare` leaves behind, written by hand.
  const prepare = ({ sourcedEvents = {} } = {}) => {
    fs.mkdirSync(path.join(inputs, "previous-release"), { recursive: true });
    fs.mkdirSync(path.join(inputs, "sourced-events"), { recursive: true });
    fs.writeFileSync(
      path.join(inputs, "historical-seen.json"),
      JSON.stringify({ "venue-1": 1700000000000 }),
    );
    fs.writeFileSync(
      path.join(inputs, "placed-showing-ids.json"),
      JSON.stringify({ "eventbrite.co.uk": ["eventbrite.co.uk-1"] }),
    );
    for (const [location, events] of Object.entries(sourcedEvents)) {
      fs.writeFileSync(
        path.join(inputs, "sourced-events", location),
        v8.serialize(events),
      );
    }
  };

  beforeEach(() => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "transform-inputs-"));
    inputs = path.join(root, "transform-inputs");
    process.chdir(root);
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  // JSON would drop `overview.year` and with it the difference between a key
  // set to undefined and no key at all; a venue is handed what findEvents
  // returned, in the order getSourcedEventsFor builds it.
  it("hands a venue exactly the sourced events prepared for it", async () => {
    const events = {
      "eventbrite.co.uk": [
        { showingId: "eventbrite.co.uk-1", overview: { year: undefined } },
      ],
      "dice.fm": [],
      "bbk.ac.uk": undefined,
    };
    prepare({ sourcedEvents: { "venue-1": events } });

    const { sourcedEvents } = await readTransformInputs("venue-1");

    // toEqual rather than toStrictEqual: v8.deserialize builds its objects in
    // Node's realm, not jest's sandbox, so their prototypes differ here only.
    // The key checks below are what toStrictEqual would have added.
    expect(sourcedEvents).toEqual(events);
    expect(Object.keys(sourcedEvents["eventbrite.co.uk"][0].overview)).toEqual([
      "year",
    ]);
    expect(Object.keys(sourcedEvents)).toEqual([
      "eventbrite.co.uk",
      "dice.fm",
      "bbk.ac.uk",
    ]);
  });

  it("reads where each source places its showings", async () => {
    prepare({ sourcedEvents: { "venue-1": {} } });

    const { placedShowingIds } = await readTransformInputs("venue-1");

    expect(placedShowingIds).toEqual(
      new Map([["eventbrite.co.uk", new Set(["eventbrite.co.uk-1"])]]),
    );
  });

  // Every venue gets a file, so a missing one is inputs prepared without it -
  // not a venue the sources have nothing for.
  it("throws for a venue with no sourced events prepared", async () => {
    prepare({ sourcedEvents: { "venue-1": {} } });

    await expect(readTransformInputs("venue-2")).rejects.toThrow(
      "No sourced events prepared for venue-2",
    );
  });

  it("throws when the inputs have not been prepared", async () => {
    await expect(readTransformInputs("venue-1")).rejects.toThrow(
      "run `transform-prepare` first",
    );
  });
});
