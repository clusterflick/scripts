const fs = require("fs");
const path = require("path");
const { classifyPage } = require("../health-probe");

// The page Curzon actually served on 2026-08-25, captured from the probe's own
// failure artifact. Anchoring the test to it rather than a hand-written sample
// keeps the two traps it contains honest: it carries Cloudflare's detection
// beacon without being a challenge, and it is a holding page without saying so
// in any header.
const curzonHoldingPage = fs.readFileSync(
  path.join(__dirname, "fixtures", "curzon-holding-page.html"),
  "utf8",
);

const pageServing = (content) => ({ content: async () => content });

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

  it("falls back to a probe error when the page is neither", async () => {
    const failure = await classifyPage(
      pageServing("<html><body>An ordinary page</body></html>"),
      responseWith(),
      "No API token on https://www.curzon.com",
    );

    expect(failure.reason).toEqual({
      kind: "probe-error",
      message: "No API token on https://www.curzon.com",
    });
  });
});
