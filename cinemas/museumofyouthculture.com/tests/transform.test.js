const transform = require("../transform");
const attributes = require("../attributes");
const { expectedClosures } = require("../../../common/expected-closures");
const { silenceConsoleLog } = require("../../../common/test-utils");

// The declared closure this venue's carve-out rides on. Read rather than
// hardcoded, so the test follows the entry when its dates move and disappears
// with it when it lapses.
const closure = expectedClosures.find(({ venue }) => venue === attributes.id);

// What the retrieve hands over once it has stood down for the closure.
const noPage = { movieListPage: null };

const lumaEvent = {
  showingId: "luma.com-evt-test",
  title: "Black Leprechaun Press Night",
  url: "https://luma.com/black-leprechaun",
  overview: { categories: [], directors: [], actors: [] },
  performances: [],
  matchingHints: {},
};

describe("museum of youth culture transform with no listings page", () => {
  const consoleLog = silenceConsoleLog();

  afterEach(() => {
    jest.useRealTimers();
  });

  const setToday = (date) => jest.useFakeTimers().setSystemTime(new Date(date));

  it("fails when the venue is not expected to be closed", async () => {
    setToday("2026-07-11");
    await expect(transform(noPage, {})).rejects.toThrow(
      "No listings page was retrieved for museumofyouthculture.com",
    );
  });

  (closure ? it : it.skip)(
    "keeps what the sources find while the venue is expected to be closed",
    async () => {
      setToday(`${closure.from}T12:00:00`);
      await expect(
        transform(noPage, { "luma.com": [lumaEvent] }),
      ).resolves.toEqual([lumaEvent]);
      // The log is the whole point of the carve-out - an empty listing that
      // explains itself - so check it was said rather than only silenced.
      expect(consoleLog()).toHaveBeenCalledWith(
        expect.stringContaining(closure.reason),
      );
    },
  );
});
