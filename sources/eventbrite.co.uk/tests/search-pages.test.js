const { disableCache } = require("../../../common/test-utils");

// Passthrough the daily cache so each fetch really goes through the mocked
// fetch below, rather than reading or writing cache files on disk.
jest.mock("../../../common/cache");
disableCache();

jest.mock("../seeded-organizers", () => []);

const retrieve = require("../retrieve");

const serverDataPage = (data) =>
  `<script> window.__SERVER_DATA__ = ${JSON.stringify(data)};</script>`;

// The shape that arrived for two search pages on 14th October 2026: a page the
// `__NEXT_DATA__` fallback parses, carrying neither results nor a page count.
const nextDataPage = () =>
  `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: {},
  })}</script>`;

const response = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: "",
  headers: { get: () => null },
  text: async () => body,
});

const runRetrieve = async () => {
  const settled = retrieve().then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await jest.runAllTimersAsync();
  return settled;
};

const TEST_TIMEOUT_MS = 15_000;

describe("eventbrite search pages", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it(
    "fails loudly when a search page carries no results",
    async () => {
      global.fetch = jest.fn(async (url) =>
        url.endsWith("?page=2")
          ? response(200, nextDataPage())
          : response(
              200,
              serverDataPage({
                page_count: 3,
                search_data: { events: { results: [] } },
              }),
            ),
      );

      const { error } = await runRetrieve();

      expect(error).toBeDefined();
      expect(error.message).toBe(
        "No search results found at https://www.eventbrite.co.uk/d/united-kingdom--london/screening/?page=2",
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "fails loudly rather than stopping when a search page has no page count",
    async () => {
      global.fetch = jest.fn(async (url) =>
        response(
          200,
          serverDataPage({
            ...(url.endsWith("?page=2") ? {} : { page_count: 3 }),
            search_data: { events: { results: [] } },
          }),
        ),
      );

      const { error } = await runRetrieve();

      expect(error).toBeDefined();
      expect(error.message).toBe(
        "No search results found at https://www.eventbrite.co.uk/d/united-kingdom--london/screening/?page=2",
      );
      // Page 3 is never asked for once page 2 fails.
      const urls = global.fetch.mock.calls.map(([url]) => url);
      expect(urls).toEqual([
        "https://www.eventbrite.co.uk/d/united-kingdom--london/screening/?page=1",
        "https://www.eventbrite.co.uk/d/united-kingdom--london/screening/?page=2",
      ]);
    },
    TEST_TIMEOUT_MS,
  );
});
