const transform = require("../transform");
const attributes = require("../attributes");
const { expectedClosures } = require("../../../common/expected-closures");
const { silenceConsoleLog } = require("../../../common/test-utils");

// The declared closure this venue's carve-out rides on. Read rather than
// hardcoded, so the test follows the entry when its dates move and disappears
// with it when it lapses.
const closure = expectedClosures.find(({ venue }) => venue === attributes.id);

// What the retrieve hands over once it has stood down for the closure: the
// venue's domain does not resolve, so there is no page to read events off.
const noEvents = { eventsData: [] };

describe("fulham pier transform with no listings", () => {
  const consoleLog = silenceConsoleLog();

  afterEach(() => {
    jest.useRealTimers();
  });

  const setToday = (date) => jest.useFakeTimers().setSystemTime(new Date(date));

  it("fails when the venue is not expected to be closed", async () => {
    setToday("2026-07-11");
    await expect(transform(noEvents, {})).rejects.toThrow(
      "No movies found - the page structure may have changed",
    );
  });

  (closure ? it : it.skip)(
    "returns nothing while the venue is expected to be closed",
    async () => {
      setToday(`${closure.from}T12:00:00`);
      await expect(transform(noEvents, {})).resolves.toEqual([]);
      // The log is the whole point of the carve-out - an empty release that
      // explains itself - so check it was said rather than only silenced.
      expect(consoleLog()).toHaveBeenCalledWith(
        expect.stringContaining(closure.reason),
      );
    },
  );
});
