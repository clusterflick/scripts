const { withMovieDbRetry, isMissingMovieDbEntry } = require("../moviedb-retry");

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

// Axios reports a request that never got an answer with no `response` at all,
// and one that did with the status and headers hanging off it.
const droppedConnection = () =>
  Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });

const httpError = (status, headers = {}) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, headers },
  });

describe("withMovieDbRetry", () => {
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

  it("rides out more than one dropped connection in a row", async () => {
    // The failure that took out a whole transform group: the wrapper this
    // replaced retried once, so a second reset was fatal.
    const call = jest
      .fn()
      .mockRejectedValueOnce(droppedConnection())
      .mockRejectedValueOnce(droppedConnection())
      .mockResolvedValueOnce({ id: 550 });

    const { value } = await settleWithTimers(
      withMovieDbRetry("movieInfo 550", call),
    );

    expect(value).toEqual({ id: 550 });
    expect(call).toHaveBeenCalledTimes(3);
  });

  it("names the failing call so retries can be traced", async () => {
    const call = jest
      .fn()
      .mockRejectedValueOnce(droppedConnection())
      .mockResolvedValueOnce({ id: 550 });

    await settleWithTimers(withMovieDbRetry("movieInfo 550", call));

    expect(logs[0]).toContain("themoviedb movieInfo 550");
    expect(logs[0]).toContain("ECONNRESET");
  });

  it("gives up once the budget is spent, surfacing the last error", async () => {
    const call = jest.fn().mockRejectedValue(droppedConnection());

    const { error } = await settleWithTimers(
      withMovieDbRetry("movieInfo 550", call),
    );

    expect(error.message).toBe("read ECONNRESET");
    expect(call).toHaveBeenCalledTimes(5);
  });

  it("does not spend the budget on a deleted movie", async () => {
    // Search still lists entries that have since been removed, so a 404 here
    // is an answer, not a failure - waiting seven minutes to be told again
    // would stall every venue that hits one.
    const call = jest.fn().mockRejectedValue(httpError(404));

    const { error } = await settleWithTimers(
      withMovieDbRetry("movieInfo 550", call),
    );

    expect(error.response.status).toBe(404);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("does not spend the budget on a rejected key", async () => {
    const call = jest.fn().mockRejectedValue(httpError(401));

    await settleWithTimers(withMovieDbRetry("movieInfo 550", call));

    expect(call).toHaveBeenCalledTimes(1);
  });

  it("retries a server-side error", async () => {
    const call = jest
      .fn()
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValueOnce({ id: 550 });

    const { value } = await settleWithTimers(
      withMovieDbRetry("movieInfo 550", call),
    );

    expect(value).toEqual({ id: 550 });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("waits as long as a rate limit asks rather than guessing", async () => {
    const call = jest
      .fn()
      .mockRejectedValueOnce(httpError(429, { "retry-after": "5" }))
      .mockResolvedValueOnce({ id: 550 });

    const { value } = await settleWithTimers(
      withMovieDbRetry("movieInfo 550", call),
    );

    expect(value).toEqual({ id: 550 });
    // 5s from the header, not the 30s the backoff would have chosen.
    expect(logs[0]).toContain("retrying in 5s");
  });

  it("reads Retry-After off an AxiosHeaders instance", async () => {
    // Axios hands back an object with a `get`, not a plain map of headers.
    const headers = { get: (name) => (name === "retry-after" ? "7" : null) };
    const call = jest
      .fn()
      .mockRejectedValueOnce(httpError(429, headers))
      .mockResolvedValueOnce({ id: 550 });

    await settleWithTimers(withMovieDbRetry("movieInfo 550", call));

    expect(logs[0]).toContain("retrying in 7s");
  });
});

describe("isMissingMovieDbEntry", () => {
  it("is true only for a 404", () => {
    expect(isMissingMovieDbEntry(httpError(404))).toBe(true);
    expect(isMissingMovieDbEntry(httpError(500))).toBe(false);
    // An unreachable API is not an answer about whether the movie exists.
    expect(isMissingMovieDbEntry(droppedConnection())).toBe(false);
  });
});
