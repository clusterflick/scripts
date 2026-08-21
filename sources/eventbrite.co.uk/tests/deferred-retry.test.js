const { disableCache } = require("../../../common/test-utils");

// Passthrough the daily cache so each fetch really goes through the mocked
// fetch below, rather than reading or writing cache files on disk.
jest.mock("../../../common/cache");
disableCache();

const retrieve = require("../retrieve");

const SEARCH_URL_PATTERN = /\/d\/united-kingdom--london\//;

const searchPage = (events) =>
  `<script> window.__SERVER_DATA__ = ${JSON.stringify({
    page_count: 1,
    search_data: { events: { results: events } },
  })};</script>`;

const eventPage = (id) =>
  `<script> window.__SERVER_DATA__ = ${JSON.stringify({ id })};</script>`;

const makeEvent = (id) => ({
  id,
  url: `https://www.eventbrite.co.uk/e/event-${id}`,
});

const response = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: "",
  headers: { get: () => null },
  text: async () => body,
});

const networkError = () => {
  const error = new TypeError("fetch failed");
  error.cause = Object.assign(new Error("read ECONNRESET"), {
    code: "ECONNRESET",
  });
  return error;
};

// Both searches run, so serve the same single page of events to each.
const setupFetch = (events, eventHandler) => {
  global.fetch = jest.fn(async (url) => {
    if (SEARCH_URL_PATTERN.test(url)) return response(200, searchPage(events));
    return eventHandler(url);
  });
};

const runRetrieve = async () => {
  const settled = retrieve().then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await jest.runAllTimersAsync();
  return settled;
};

describe("eventbrite deferred retry", () => {
  let logs;

  beforeEach(() => {
    jest.useFakeTimers();
    logs = [];
    jest.spyOn(console, "log").mockImplementation((line) => logs.push(line));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("recovers an event that was unreachable during the main loop", async () => {
    const events = [makeEvent("1"), makeEvent("2")];
    // Event 2 is unreachable for every attempt of the main loop's inline retry
    // budget, then comes back — exactly the shape seen in production, where the
    // condition outlasts the inline retries but has cleared by the sweep.
    let attemptsAtEvent2 = 0;
    setupFetch(events, async (url) => {
      if (!url.endsWith("event-2")) return response(200, eventPage("1"));
      attemptsAtEvent2 += 1;
      if (attemptsAtEvent2 <= 4) throw networkError();
      return response(200, eventPage("2"));
    });

    const { value, error } = await runRetrieve();

    expect(error).toBeUndefined();
    expect(Object.keys(value.moviePages)).toHaveLength(2);
    expect(value.moviePages["https://www.eventbrite.co.uk/e/event-2"]).toEqual({
      id: "2",
    });
    // It must be the deferred sweep that recovered it, not a longer inline
    // budget — the inline retries are deliberately short precisely because the
    // sweep is what does the work.
    expect(logs).toContain(" - Retrying 1 unreachable events...");
  });

  it("drops a removed event without deferring it", async () => {
    const events = [makeEvent("1"), makeEvent("2")];
    setupFetch(events, async (url) =>
      url.endsWith("event-2")
        ? response(404, "")
        : response(200, eventPage("1")),
    );

    const { value, error } = await runRetrieve();

    expect(error).toBeUndefined();
    expect(Object.keys(value.moviePages)).toHaveLength(1);
    // A 404 is definitive, so it must not be retried by the sweep.
    const event2Calls = global.fetch.mock.calls.filter(([url]) =>
      url.endsWith("event-2"),
    );
    expect(event2Calls).toHaveLength(1);
    expect(logs.some((line) => line.includes("Retrying"))).toBe(false);
  });

  it("fails loudly when an event is still unreachable after the sweep", async () => {
    const events = [makeEvent("1"), makeEvent("2")];
    setupFetch(events, async (url) => {
      if (url.endsWith("event-2")) throw networkError();
      return response(200, eventPage("1"));
    });

    const { error } = await runRetrieve();

    // Previously this silently dropped the event and shipped a thinner dataset.
    expect(error).toBeDefined();
    expect(error.message).toContain("Could not reach 1 event page(s)");
    expect(error.message).toContain("event-2");
  });
});
