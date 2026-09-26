const { silenceConsoleLog } = require("../../../common/test-utils");
const { expectedClosures } = require("../../../common/expected-closures");
const attributes = require("../attributes");

jest.mock("../../../common/tribe-events/retrieve");
const {
  retrievePaginatedListView,
} = require("../../../common/tribe-events/retrieve");
const retrieve = require("../retrieve");

// The declared closure this venue's carve-out rides on. Read rather than
// hardcoded, so the test follows the entry when its dates move and disappears
// with it when it lapses.
const closure = expectedClosures.find(({ venue }) => venue === attributes.id);

// What SiteGround refusing the site looks like from the retrieve: the first
// page is rate limited on every attempt, so no page is ever read.
const unreachable = () =>
  new Error(`Failed to fetch ${attributes.url} - 429 Too Many Requests`);

describe("stanley arts retrieve when the site is unreachable", () => {
  const consoleLog = silenceConsoleLog();

  beforeEach(() => {
    retrievePaginatedListView.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const setToday = (date) => jest.useFakeTimers().setSystemTime(new Date(date));

  it("fails when the venue is not expected to be closed", async () => {
    setToday("2026-07-11");
    retrievePaginatedListView.mockRejectedValue(unreachable());
    await expect(retrieve()).rejects.toThrow("429 Too Many Requests");
  });

  (closure ? it : it.skip)(
    "returns no pages while the venue is expected to be closed",
    async () => {
      setToday(`${closure.from}T12:00:00`);
      retrievePaginatedListView.mockRejectedValue(unreachable());
      await expect(retrieve()).resolves.toEqual({ movieListPages: [] });
      // Both halves matter in the log: which closure was stood down for, and
      // the error that was swallowed to do it.
      expect(consoleLog()).toHaveBeenCalledWith(
        expect.stringContaining(closure.reason),
      );
      expect(consoleLog()).toHaveBeenCalledWith(
        expect.stringContaining("429 Too Many Requests"),
      );
    },
  );

  (closure ? it : it.skip)(
    "passes the site's pages through when it is reachable again",
    async () => {
      setToday(`${closure.from}T12:00:00`);
      const retrieved = { movieListPages: ["<html></html>"] };
      retrievePaginatedListView.mockResolvedValue(retrieved);
      await expect(retrieve()).resolves.toEqual(retrieved);
    },
  );
});
