const { getPageEscalating } = require("../camoufox-escalation");

// Stands in for a session's `getPage`: tries `withoutBrowser` and reports
// "escalated" where the session would hand the page to the browser.
const getPage = async (url, cacheKey, readWithBrowser, { withoutBrowser }) =>
  (await withoutBrowser(url)) ?? "escalated";

const fetchPage = () =>
  getPageEscalating(getPage, "https://example.com/", "key", {
    selector: "#content",
  });

const respondWith = (body, init) => {
  global.fetch = jest.fn(async () => new Response(body, init));
};

describe("getPageEscalating", () => {
  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("stays on fetch for the real page", async () => {
    respondWith('<main id="content"></main>');
    await expect(fetchPage()).resolves.toBe('<main id="content"></main>');
  });

  it.each([
    ["Cloudflare", { "cf-mitigated": "challenge" }, 403],
    ["SiteGround", { "sg-captcha": "challenge" }, 202],
    ["Bunny Shield", { "cdn-challenge": "true" }, 403],
  ])("escalates on a %s challenge", async (vendor, headers, status) => {
    respondWith("", { status, headers });
    await expect(fetchPage()).resolves.toBe("escalated");
  });

  it("escalates on challenge copy under a refused status", async () => {
    respondWith("<title>Just a moment...</title>", { status: 403 });
    await expect(fetchPage()).resolves.toBe("escalated");
  });

  it("escalates on a page without the selector", async () => {
    respondWith("<main></main>");
    await expect(fetchPage()).resolves.toBe("escalated");
  });

  it("escalates on a redirect it was told not to follow", async () => {
    respondWith(null, { status: 302, headers: { location: "/" } });
    await expect(fetchPage()).resolves.toBe("escalated");
  });

  it("fails rather than escalating on an ordinary error", async () => {
    respondWith("Not found", { status: 404 });
    await expect(fetchPage()).rejects.toThrow(
      "Unexpected 404 response for https://example.com/",
    );
  });
});
