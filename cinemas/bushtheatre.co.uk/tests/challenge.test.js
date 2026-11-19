const { disableCache } = require("../../../common/test-utils");

// Passthrough the daily cache so each page really goes through the mocked
// fetch and browser below, rather than reading or writing cache files on disk.
jest.mock("../../../common/cache");
disableCache();

// A stand-in for Camoufox: every navigation is answered from `browserPages`,
// keyed by URL, and recorded in `browserVisits`. Only the calls the session
// helper and the retriever make are implemented.
const browserPages = {};
const browserVisits = [];
const launches = [];
jest.mock(
  "camoufox-js",
  () => ({
    Camoufox: async (options) => {
      launches.push(options);
      return {
        isConnected: () => true,
        close: async () => {},
        newContext: async () => ({
          setDefaultTimeout: () => {},
          newPage: async () => {
            let current;
            return {
              goto: async (url) => {
                browserVisits.push(url);
                current = url;
                return null;
              },
              waitForSelector: async () => {},
              waitForLoadState: async () => {},
              content: async () => browserPages[current],
              url: () => current,
              close: async () => {},
            };
          },
        }),
      };
    },
  }),
  { virtual: true },
);

const retrieve = require("../retrieve");

const LISTING_PAGE = "https://www.bushtheatre.co.uk/whats-on/";
const EVENT_PAGE = "https://www.bushtheatre.co.uk/event/the-bridge/";

const listingPage = `<html><body><div class="events_listing"><a class="events_item__link" href="/event/the-bridge/"></a></div></body></html>`;
const eventPage = `<html><body><h1>The Bridge</h1><div class="event_about"></div></body></html>`;

const response = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: "",
  headers: { get: (name) => headers[name] ?? null },
  text: async () => body,
});

// The interstitial a plain request got on 19th November 2026 - a 200 carrying
// no vendor header the classifier knows, so only the missing listing gives it
// away.
const interstitial = () =>
  response(
    200,
    "<html><head><title>One moment, please...</title></head><body>Please wait while your request is being verified...</body></html>",
  );

describe("Bush Theatre behind a bot challenge", () => {
  beforeEach(() => {
    browserVisits.length = 0;
    launches.length = 0;
    browserPages[LISTING_PAGE] = listingPage;
    browserPages[EVENT_PAGE] = eventPage;
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("escalates to Camoufox for the rest of the run at the interstitial", async () => {
    global.fetch = jest.fn(async () => interstitial());

    const { eventListPage, eventPages } = await retrieve();

    expect(eventListPage).toBe(listingPage);
    expect(eventPages).toEqual([eventPage]);
    expect(launches).toHaveLength(1);
    // Once challenged, every later page goes straight to the browser.
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(browserVisits).toEqual([LISTING_PAGE, EVENT_PAGE]);
  });

  it("stays on fetch while the site answers with its pages", async () => {
    global.fetch = jest.fn(async (url) => response(200, browserPages[url]));

    const { eventPages } = await retrieve();

    expect(eventPages).toEqual([eventPage]);
    expect(launches).toHaveLength(0);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("fails rather than escalating on an ordinary error", async () => {
    global.fetch = jest.fn(async () => response(500, "Server error"));

    await expect(retrieve()).rejects.toThrow(
      `Unexpected 500 response for ${LISTING_PAGE}`,
    );
    expect(launches).toHaveLength(0);
  });
});
