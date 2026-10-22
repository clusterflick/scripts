const { describeRefusal, requestFromPage } = require("../request-from-page");

// A page whose `evaluate` runs the in-page function here, against the mocked
// global `fetch` - so the code that would run in the browser is what is tested.
const fakePage = (overrides = {}) => ({
  evaluate: async (fn, arg) => fn(arg),
  waitForLoadState: jest.fn(async () => {}),
  ...overrides,
});

describe("requestFromPage", () => {
  let logs;

  beforeEach(() => {
    logs = [];
    jest.spyOn(console, "log").mockImplementation((line) => logs.push(line));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("hands back the body and the challenge headers", async () => {
    global.fetch = jest.fn(async () => new Response('{"ok":true}'));

    const response = await requestFromPage(fakePage(), "https://example.com/");

    expect(response).toMatchObject({
      ok: true,
      status: 200,
      body: '{"ok":true}',
    });
    expect(logs).toEqual([]);
  });

  it("logs a refusal and says which it was", async () => {
    global.fetch = jest.fn(
      async () =>
        new Response("<title>Just a moment...</title>", {
          status: 403,
          headers: { "cf-mitigated": "challenge" },
        }),
    );

    const response = await requestFromPage(fakePage(), "https://example.com/");

    expect(describeRefusal(response)).toBe(
      "403 challenge (cloudflare, via cf-mitigated)",
    );
    expect(logs).toEqual([
      "      - 🤖 Bot 403 challenge (cloudflare, via cf-mitigated) at https://example.com/",
    ]);
  });

  describe("a call with no readable response", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("is retried once, after a wait", async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValueOnce(
          new TypeError("NetworkError when attempting to fetch resource."),
        )
        .mockResolvedValueOnce(new Response('{"ok":true}'));

      const pending = requestFromPage(fakePage(), "https://example.com/");
      await jest.advanceTimersByTimeAsync(0);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(40_000);

      await expect(pending).resolves.toMatchObject({
        ok: true,
        status: 200,
        body: '{"ok":true}',
      });
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(logs).toEqual([
        expect.stringMatching(
          /^ ! - No readable response from https:\/\/example\.com\/ \(refused before a response was readable \(NetworkError when attempting to fetch resource\.\)\), retrying in \d+s \.\.\.$/,
        ),
      ]);
    });

    it("is reported as status 0 when the retry fails too", async () => {
      global.fetch = jest.fn(async () => {
        throw new TypeError("Failed to fetch");
      });

      const pending = requestFromPage(fakePage(), "https://example.com/");
      await jest.advanceTimersByTimeAsync(40_000);

      await expect(pending).resolves.toMatchObject({
        ok: false,
        status: 0,
        body: "",
      });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  it("waits for the page to load again when a re-check destroys the context", async () => {
    global.fetch = jest.fn(async () => new Response("{}"));
    let calls = 0;
    const page = fakePage({
      evaluate: async (fn, arg) => {
        calls += 1;
        if (calls === 1) throw new Error("Execution context was destroyed");
        return fn(arg);
      },
    });

    await expect(
      requestFromPage(page, "https://example.com/"),
    ).resolves.toMatchObject({ ok: true });
    expect(page.waitForLoadState).toHaveBeenCalledTimes(1);
  });
});
