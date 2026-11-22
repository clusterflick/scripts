const { silenceConsoleLog } = require("../../../common/test-utils");
const { expectedClosures } = require("../../../common/expected-closures");
const attributes = require("../attributes");

jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  fetchText: jest.fn(),
}));
const { fetchText } = require("../../../common/utils");
const retrieve = require("../retrieve");

// The declared closure this venue's carve-out rides on. Read rather than
// hardcoded, so the test follows the entry when its dates move and disappears
// with it when it lapses.
const closure = expectedClosures.find(({ venue }) => venue === attributes.id);

// What the retrieve is handed while the host has the site suspended: every page
// redirects to cPanel's suspension page, which `fetch` follows to a 200.
const suspendedPage = `<html><head><title>Account Suspended</title></head>
  <body><h1>Account Suspended</h1>
  <p>This Account has been suspended.</p></body></html>`;

const listingPage = `<h2 class="fl-heading">Upcoming Events</h2>
  <div class="fl-col-group"><div class="fl-module fl-module-rich-text">
    <p>06.12.26 | 7pm<br>Film Night: Rude Boy</p>
  </div></div>`;

describe("museum of youth culture retrieve when the site is suspended", () => {
  const consoleLog = silenceConsoleLog();

  beforeEach(() => {
    fetchText.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const setToday = (date) => jest.useFakeTimers().setSystemTime(new Date(date));

  it("fails when the venue is not expected to be closed", async () => {
    setToday("2026-07-11");
    fetchText.mockResolvedValue(suspendedPage);
    await expect(retrieve()).rejects.toThrow("No Upcoming Events heading");
  });

  (closure ? it : it.skip)(
    "saves no page while the venue is expected to be closed",
    async () => {
      setToday(`${closure.from}T12:00:00`);
      fetchText.mockResolvedValue(suspendedPage);
      await expect(retrieve()).resolves.toEqual({ movieListPage: null });
      // Both halves matter in the log: which closure was stood down for, and
      // the error that was swallowed to do it.
      expect(consoleLog()).toHaveBeenCalledWith(
        expect.stringContaining(closure.reason),
      );
      expect(consoleLog()).toHaveBeenCalledWith(
        expect.stringContaining("No Upcoming Events heading"),
      );
    },
  );

  (closure ? it : it.skip)(
    "passes the site's page through when it is back",
    async () => {
      setToday(`${closure.from}T12:00:00`);
      fetchText.mockResolvedValue(listingPage);
      await expect(retrieve()).resolves.toEqual({
        movieListPage: listingPage,
      });
    },
  );
});
