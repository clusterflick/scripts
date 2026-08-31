const { withRetry, fetchWithRetry } = require("../utils");

// Attach handlers synchronously (before any await) so a rejection can't land
// unhandled while the fake timers are still being driven, then run the retry
// sleeps out and report how the promise settled.
const settleWithTimers = async (promise) => {
  const settled = promise.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await jest.runAllTimersAsync();
  return settled;
};

const htmlResponse = (status, body = "") => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: "",
  headers: { get: () => null },
  text: async () => body,
});

describe("withRetry", () => {
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

  it("surfaces the underlying cause of an opaque network error", async () => {
    // Undici throws a bare "fetch failed" with the real reason on `cause`.
    // Without that detail every connection problem looks identical in the logs.
    const error = new TypeError("fetch failed");
    error.cause = Object.assign(new Error("read ECONNRESET"), {
      code: "ECONNRESET",
    });
    const fn = jest.fn().mockRejectedValue(error);

    const { error: thrown } = await settleWithTimers(
      withRetry(fn, { retries: 1, delayMs: 10, label: "Fetch" }),
    );
    expect(thrown.message).toBe("fetch failed");

    expect(logs.every((line) => line.includes("ECONNRESET"))).toBe(true);
  });

  it("widens the gap between attempts when given a backoff factor", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("nope"));

    const { error } = await settleWithTimers(
      withRetry(fn, { retries: 3, delayMs: 10_000, backoffFactor: 2 }),
    );
    expect(error.message).toBe("nope");

    const waits = logs
      .map((line) => line.match(/retrying in (\d+)s/))
      .filter(Boolean)
      .map(([, seconds]) => Number(seconds));

    // Jittered by +/-20%, so assert the band rather than an exact schedule.
    expect(waits).toHaveLength(3);
    expect(waits[0]).toBeGreaterThanOrEqual(8);
    expect(waits[0]).toBeLessThanOrEqual(12);
    expect(waits[1]).toBeGreaterThanOrEqual(16);
    expect(waits[1]).toBeLessThanOrEqual(24);
    expect(waits[2]).toBeGreaterThanOrEqual(32);
    expect(waits[2]).toBeLessThanOrEqual(48);
  });

  it("stops immediately on an error the caller says is permanent", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("gone"));

    const { error } = await settleWithTimers(
      withRetry(fn, {
        retries: 3,
        delayMs: 10_000,
        shouldRetry: () => false,
      }),
    );

    expect(error.message).toBe("gone");
    // The point of shouldRetry: the remaining attempts would fail identically,
    // so spending the budget only delays the real error.
    expect(fn).toHaveBeenCalledTimes(1);
    expect(logs.some((line) => line.includes("retrying in"))).toBe(false);
  });

  it("keeps retrying the errors the caller says are transient", async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("busy"), { transient: true }),
      )
      .mockResolvedValueOnce("done");

    const { value } = await settleWithTimers(
      withRetry(fn, {
        retries: 3,
        delayMs: 10_000,
        shouldRetry: (error) => error.transient === true,
      }),
    );

    expect(value).toBe("done");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("keeps a fixed delay when no backoff factor is given", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("nope"));

    const { error } = await settleWithTimers(
      withRetry(fn, { retries: 2, delayMs: 10_000 }),
    );
    expect(error.message).toBe("nope");

    const waits = logs
      .map((line) => line.match(/retrying in (\d+)s/))
      .filter(Boolean)
      .map(([, seconds]) => Number(seconds));

    expect(waits).toHaveLength(2);
    for (const wait of waits) {
      expect(wait).toBeGreaterThanOrEqual(8);
      expect(wait).toBeLessThanOrEqual(12);
    }
  });
});

describe("fetchWithRetry retryStatuses", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("does not retry a 404 by default", async () => {
    global.fetch = jest.fn().mockResolvedValue(htmlResponse(404));

    const { value: response } = await settleWithTimers(
      fetchWithRetry("https://example.com", {}, { retries: 3, delayMs: 10 }),
    );

    expect(response.status).toBe(404);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries a 404 when the caller opts that status in", async () => {
    // Eventbrite answers deep search pages with a throttling 404, so that one
    // endpoint opts in without making 404 retryable everywhere else.
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(htmlResponse(404))
      .mockResolvedValueOnce(htmlResponse(404))
      .mockResolvedValueOnce(htmlResponse(200, "ok"));

    const { value: response } = await settleWithTimers(
      fetchWithRetry(
        "https://example.com",
        {},
        { retries: 3, delayMs: 10, retryStatuses: [404] },
      ),
    );

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("still retries a 429 without any opt-in", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(htmlResponse(429))
      .mockResolvedValueOnce(htmlResponse(200, "ok"));

    const { value: response } = await settleWithTimers(
      fetchWithRetry("https://example.com", {}, { retries: 3, delayMs: 10 }),
    );

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
