const { silenceConsoleLog } = require("../../../common/test-utils");
const { expectedClosures } = require("../../../common/expected-closures");
const attributes = require("../attributes");

jest.mock("../../../common/get-page-with-playwright");
const getPageWithPlaywright = require("../../../common/get-page-with-playwright");
const retrieve = require("../retrieve");

// The declared closure this venue's carve-out rides on. Read rather than
// hardcoded, so the test follows the entry when its dates move and disappears
// with it when it lapses.
const closure = expectedClosures.find(({ venue }) => venue === attributes.id);

// What a dead domain looks like from the retrieve: the navigation never lands,
// so nothing gets as far as the page callback.
const unreachable = () =>
  new Error(
    "page.goto: net::ERR_NAME_NOT_RESOLVED at https://www.fulhampier.com/whats-on",
  );

describe("fulham pier retrieve when the site is unreachable", () => {
  const consoleLog = silenceConsoleLog();

  beforeEach(() => {
    getPageWithPlaywright.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const setToday = (date) => jest.useFakeTimers().setSystemTime(new Date(date));

  it("fails when the venue is not expected to be closed", async () => {
    setToday("2026-07-11");
    getPageWithPlaywright.mockRejectedValue(unreachable());
    await expect(retrieve()).rejects.toThrow("ERR_NAME_NOT_RESOLVED");
  });

  (closure ? it : it.skip)(
    "returns no events while the venue is expected to be closed",
    async () => {
      setToday(`${closure.from}T12:00:00`);
      getPageWithPlaywright.mockRejectedValue(unreachable());
      await expect(retrieve()).resolves.toEqual({ eventsData: [] });
      // Both halves matter in the log: which closure was stood down for, and
      // the error that was swallowed to do it.
      expect(consoleLog()).toHaveBeenCalledWith(
        expect.stringContaining(closure.reason),
      );
      expect(consoleLog()).toHaveBeenCalledWith(
        expect.stringContaining("ERR_NAME_NOT_RESOLVED"),
      );
    },
  );

  (closure ? it : it.skip)(
    "passes the site's events through when it is reachable again",
    async () => {
      setToday(`${closure.from}T12:00:00`);
      const eventsData = [{ event_no: 1 }];
      getPageWithPlaywright.mockResolvedValue(eventsData);
      await expect(retrieve()).resolves.toEqual({ eventsData });
    },
  );
});
