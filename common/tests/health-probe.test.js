const fs = require("fs");
const path = require("path");
const { classifyPage, parseProbeJson, probeJson } = require("../health-probe");

// The page Curzon actually served on 2026-08-25, captured from the probe's own
// failure artifact. Anchoring the test to it rather than a hand-written sample
// keeps the two traps it contains honest: it carries Cloudflare's detection
// beacon without being a challenge, and it is a holding page without saying so
// in any header.
const curzonHoldingPage = fs.readFileSync(
  path.join(__dirname, "fixtures", "curzon-holding-page.html"),
  "utf8",
);

const pageServing = (content, url = "https://www.curzon.com") => ({
  content: async () => content,
  url: () => url,
});

const responseWith = (headers = {}, status = 200) => ({
  status: () => status,
  headers: () => headers,
});

describe("classifyPage", () => {
  it("records a holding page as the source being down, not our probe breaking", async () => {
    const failure = await classifyPage(
      pageServing(curzonHoldingPage),
      responseWith(),
      "No API token on https://www.curzon.com",
    );

    // `probe-error` would say the fault is ours and fail the job; the whole
    // estate was recorded that way for the cycle this fixture came from.
    expect(failure.reason).toEqual({ kind: "source-maintenance", status: 200 });
  });

  it("does not mistake Cloudflare's detection beacon for a challenge", async () => {
    // Every Cloudflare-fronted page carries `challenge-platform/.../jsd/main.js`,
    // so treating its presence as a signal would call the whole estate blocked.
    expect(curzonHoldingPage).toContain("challenge-platform");

    const failure = await classifyPage(
      pageServing(curzonHoldingPage),
      responseWith(),
      "No API token",
    );

    expect(failure.reason.kind).not.toBe("bot-challenge");
  });

  it("still prefers the cf-mitigated header over the page copy", async () => {
    // A challenge page that also happens to mention maintenance is a challenge:
    // the header is definitive, the copy is a fallback.
    const failure = await classifyPage(
      pageServing(curzonHoldingPage),
      responseWith({ "cf-mitigated": "challenge" }, 403),
      "No API token",
    );

    expect(failure.reason).toEqual({
      kind: "bot-challenge",
      via: "cf-mitigated",
      status: 403,
    });
  });

  it("still classifies a challenge page from its copy alone", async () => {
    const failure = await classifyPage(
      pageServing("<html><title>Just a moment...</title></html>"),
      responseWith({}, 503),
      "No API token",
    );

    expect(failure.reason).toEqual({
      kind: "bot-challenge",
      via: "response-text",
      status: 503,
    });
  });

  it("records a waiting room as the source being busy, not our probe breaking", async () => {
    // Queue-it answers the navigation with a 302 to its own host, so a probe
    // that only reads the page it asked for sees results that never arrived.
    const failure = await classifyPage(
      pageServing(
        "<html><body>You are now in line</body></html>",
        // Where the probe actually landed on 2026-08-28, from the run that
        // recorded the whole BFI estate as `probe-error`.
        "https://audienceview.queue-it.net/?c=audienceview&e=bfi280826&cid=en-GB",
      ),
      responseWith(),
      "No search results on https://whatson.bfi.org.uk/Online/default.asp",
    );

    expect(failure.reason).toEqual({
      kind: "source-queue",
      status: 200,
      queue: "audienceview.queue-it.net",
      event: "bfi280826",
    });
  });

  it("does not mistake an installed queue connector for being queued", async () => {
    // Every page a Queue-it-protected site lets through carries the connector's
    // logging beacon - BFI's own 500s included - so its presence says the site
    // uses Queue-it, not that we are waiting in it.
    const failure = await classifyPage(
      pageServing(
        '<html><head><meta id="queue-it_log" data-proxyurl="https://logging.queue-it.net/logging/event" data-assemblyversion="4.5.1374.0"></head><body>Server error</body></html>',
        "https://whatson.bfi.org.uk/Online/default.asp",
      ),
      responseWith(),
      "No search results on https://whatson.bfi.org.uk/Online/default.asp",
    );

    expect(failure.reason.kind).toBe("probe-error");
  });

  it("falls back to a probe error when the page is neither", async () => {
    const failure = await classifyPage(
      pageServing("<html><body>An ordinary page</body></html>"),
      responseWith(),
      "No API token on https://www.curzon.com",
    );

    expect(failure.reason).toEqual({
      kind: "probe-error",
      message:
        "No API token on https://www.curzon.com (landed on https://www.curzon.com)",
    });
  });

  it("names where the navigation landed, not only what was asked for", async () => {
    // The question a probe error leaves behind is what we were served instead,
    // and a message naming only the requested URL cannot answer it.
    const failure = await classifyPage(
      pageServing(
        "<html><body>Sign in to continue</body></html>",
        "https://login.example.com/sso?next=%2Fonline",
      ),
      responseWith(),
      "No search results on https://whatson.example.com/Online/default.asp",
    );

    expect(failure.reason.message).toContain(
      "landed on https://login.example.com/sso?next=%2Fonline",
    );
  });
});

describe("probeJson bot refusals", () => {
  const respondWith = (body, init) => {
    global.fetch = jest.fn(async () => new Response(body, init));
  };

  const reasonFor = (promise) => promise.catch((error) => error.reason);

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ["sg-captcha", "challenge", 202],
    ["cdn-challenge", "true", 403],
  ])("records a %s challenge", async (header, value, status) => {
    respondWith("", { status, headers: { [header]: value } });
    await expect(reasonFor(probeJson("https://example.com/"))).resolves.toEqual(
      { kind: "bot-challenge", via: header, status },
    );
  });

  // A 200 that isn't JSON has already failed to be the listing, so its copy is
  // judged even though the status is ok.
  it("records challenge copy served under a 200", async () => {
    respondWith("<title>Just a moment...</title>");
    await expect(reasonFor(probeJson("https://example.com/"))).resolves.toEqual(
      { kind: "bot-challenge", via: "response-text", status: 200 },
    );
  });

  it("records a block page as a bot challenge", async () => {
    respondWith("You are unable to access example.com", { status: 403 });
    await expect(reasonFor(probeJson("https://example.com/"))).resolves.toEqual(
      { kind: "bot-challenge", via: "response-text", status: 403 },
    );
  });

  it("records a call from inside a page by its headers", () => {
    expect(() =>
      parseProbeJson("https://example.com/", {
        ok: false,
        status: 403,
        statusText: "Forbidden",
        headers: { "cdn-challenge": "true" },
        body: "",
      }),
    ).toThrow(
      expect.objectContaining({
        reason: { kind: "bot-challenge", via: "cdn-challenge", status: 403 },
      }),
    );
  });
});
