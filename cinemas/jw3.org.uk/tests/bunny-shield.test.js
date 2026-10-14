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

const LISTING_PAGE_1 =
  "https://www.jw3.org.uk/whats-on?genres[]=19&max=27&p54_page=1";
const LISTING_PAGE_2 =
  "https://www.jw3.org.uk/whats-on?genres[]=19&max=27&p54_page=2";
const EVENT_PAGE = "https://www.jw3.org.uk/whats-on/ukjff-2026";

const header = '<form class="inner" id="zoekForm" action="/search"></form>';

const listingPage = (paths) =>
  `<html><body>${header}${paths
    .map(
      (href) =>
        `<div class="eventCard"><div class="thumb"><a href="${href}"></a></div></div>`,
    )
    .join("")}</body></html>`;

// A festival hub sold elsewhere, which the retriever skips - so these cases
// need no Spektrix booking and the only requests are to JW3 itself.
const eventPage = () =>
  `<html><body>${header}<script>
var dataLayer = [{"detail_items":[{"item_production":"UKJF2026"}]}];
</script><a href="https://ukjewishfilm.org/">Tickets</a></body></html>`;

const setBrowserPages = () => {
  browserPages[LISTING_PAGE_1] = listingPage(["/whats-on/ukjff-2026"]);
  browserPages[LISTING_PAGE_2] = listingPage([]);
  browserPages[EVENT_PAGE] = eventPage();
};

const response = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: "",
  headers: { get: (name) => headers[name] ?? null },
  text: async () => body,
});

// Bunny Shield's challenge, as served to a plain request on 14th October 2026.
const challenge = () =>
  response(
    403,
    "<html><head><title>Establishing a secure connection ...</title></head></html>",
    { "cdn-challenge": "true" },
  );

describe("JW3 behind Bunny Shield", () => {
  beforeEach(() => {
    browserVisits.length = 0;
    launches.length = 0;
    setBrowserPages();
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("escalates to Camoufox for the rest of the run at the first challenge", async () => {
    global.fetch = jest.fn(async () => challenge());

    const { movieListPages, moviePages } = await retrieve();

    expect(movieListPages).toHaveLength(1);
    expect(moviePages).toEqual({});
    expect(launches).toHaveLength(1);
    // Once challenged, every later page goes straight to the browser.
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(browserVisits).toEqual([LISTING_PAGE_1, LISTING_PAGE_2, EVENT_PAGE]);
  });

  it("escalates to Camoufox on a redirect rather than following it", async () => {
    global.fetch = jest.fn(async () =>
      response(302, "", { location: LISTING_PAGE_1 }),
    );

    const { movieListPages } = await retrieve();

    expect(movieListPages).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][1]).toEqual({ redirect: "manual" });
    expect(browserVisits).toEqual([LISTING_PAGE_1, LISTING_PAGE_2, EVENT_PAGE]);
  });

  it("stays on fetch while JW3 answers with its pages", async () => {
    global.fetch = jest.fn(async (url) => response(200, browserPages[url]));

    const { movieListPages } = await retrieve();

    expect(movieListPages).toHaveLength(1);
    expect(launches).toHaveLength(0);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("fails rather than escalating on an ordinary error", async () => {
    global.fetch = jest.fn(async () => response(404, "Not found"));

    await expect(retrieve()).rejects.toThrow(
      `Unexpected 404 response for ${LISTING_PAGE_1}`,
    );
    expect(launches).toHaveLength(0);
  });
});
