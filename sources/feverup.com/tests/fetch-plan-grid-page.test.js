const { fetchJson } = require("../../../common/utils");
const fetchPlanGridPage = require("../fetch-plan-grid-page");

jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  fetchJson: jest.fn(),
}));
jest.mock("../../../common/cache", () => ({
  dailyCache: jest.fn((key, retrieve) => retrieve()),
}));

const httpError = (status) =>
  Object.assign(new Error(`Failed - ${status}`), { status });

const getUrl = (trackerId, page) => `grid?page=${page}&tracker=${trackerId}`;
const trackerOf = (url) =>
  new URL(url, "https://x").searchParams.get("tracker");
// Runs the retries' backoff on fake timers, so the test doesn't wait it out.
const fetchPage = async () => {
  const result = fetchPlanGridPage({
    getUrl,
    trackerId: "from-listing",
    page: 2,
    headers: {},
    delayMs: 0,
  });
  result.catch(() => {});
  await jest.runAllTimersAsync();
  return result;
};

describe("fetchPlanGridPage", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    fetchJson.mockReset();
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  it("asks with the listing page's tracker id first", async () => {
    fetchJson.mockResolvedValueOnce({ results: [] });
    await expect(fetchPage()).resolves.toEqual({ results: [] });
    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(trackerOf(fetchJson.mock.calls[0][0])).toBe("from-listing");
  });

  it("retries a 500 with a fresh tracker id each time, so it misses the cached error", async () => {
    fetchJson
      .mockRejectedValueOnce(httpError(500))
      .mockRejectedValueOnce(httpError(500))
      .mockResolvedValueOnce({ results: [{ id: 1 }] });
    await expect(fetchPage()).resolves.toEqual({ results: [{ id: 1 }] });

    const trackers = fetchJson.mock.calls.map(([url]) => trackerOf(url));
    expect(trackers).toHaveLength(3);
    expect(trackers[0]).toBe("from-listing");
    expect(new Set(trackers).size).toBe(3);
  });

  it("does not retry other failures", async () => {
    fetchJson.mockRejectedValueOnce(httpError(400));
    await expect(fetchPage()).rejects.toMatchObject({ status: 400 });
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it("fails once the retries are spent", async () => {
    fetchJson.mockRejectedValue(httpError(500));
    await expect(fetchPage()).rejects.toMatchObject({ status: 500 });
    expect(fetchJson).toHaveBeenCalledTimes(4);
  });
});
