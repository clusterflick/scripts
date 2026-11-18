const {
  getPageEscalating,
  retryThroughCamoufox,
} = require("../camoufox-escalation");

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

describe("getPageEscalating in the browser", () => {
  // Stands in for a session that has already escalated: hands the browser
  // callback a page whose selector never appears.
  const readUnsettled = (options) =>
    getPageEscalating(
      async (url, cacheKey, readWithBrowser) =>
        readWithBrowser(
          {
            waitForSelector: async () => {
              throw new Error("Timeout 90000ms exceeded");
            },
          },
          { status: () => 403 },
        ),
      "https://example.com/",
      "key",
      { selector: "#content", ...options },
    );

  it("throws the wait's own error without an onUnsettled", async () => {
    await expect(readUnsettled()).rejects.toThrow("Timeout 90000ms exceeded");
  });

  it("hands a page that never settles to onUnsettled", async () => {
    const classified = new Error("classified");
    const onUnsettled = jest.fn(async () => classified);
    await expect(readUnsettled({ onUnsettled })).resolves.toBe(classified);
    expect(onUnsettled).toHaveBeenCalledWith(
      expect.objectContaining({ waitForSelector: expect.any(Function) }),
      expect.objectContaining({ status: expect.any(Function) }),
      expect.any(Error),
    );
  });
});

describe("retryThroughCamoufox", () => {
  const refused = () =>
    Object.assign(new Error("403 Forbidden"), { status: 403 });
  const isRefusal = (error) => error.status === 403;

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("does not open the browser when the direct attempt succeeds", async () => {
    const throughBrowser = jest.fn();
    await expect(
      retryThroughCamoufox(async () => "direct", throughBrowser, { isRefusal }),
    ).resolves.toBe("direct");
    expect(throughBrowser).not.toHaveBeenCalled();
  });

  it("retries through the browser on a refusal, saying why", async () => {
    await expect(
      retryThroughCamoufox(
        async () => {
          throw refused();
        },
        async () => "browser",
        { isRefusal },
      ),
    ).resolves.toBe("browser");
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("403 Forbidden; retrying through Camoufox"),
    );
  });

  it("throws any other failure as it is", async () => {
    const throughBrowser = jest.fn();
    await expect(
      retryThroughCamoufox(
        async () => {
          throw new Error("404 Not Found");
        },
        throughBrowser,
        { isRefusal },
      ),
    ).rejects.toThrow("404 Not Found");
    expect(throughBrowser).not.toHaveBeenCalled();
  });
});
