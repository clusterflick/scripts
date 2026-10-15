const { disableCache } = require("../test-utils");

jest.mock("../cache");
disableCache();

// Error diagnostics write a screenshot and the page content to disk.
jest.mock("node:fs", () => ({
  promises: { mkdir: async () => {}, writeFile: async () => {} },
}));

// A stand-in for Camoufox: each navigation answers with `mockNavigation`.
let mockNavigation;
jest.mock(
  "camoufox-js",
  () => ({
    Camoufox: async () => ({
      isConnected: () => true,
      close: async () => {},
      newContext: async () => ({
        setDefaultTimeout: () => {},
        newPage: async () => ({
          goto: async () => mockNavigation.response,
          content: async () => mockNavigation.content,
          screenshot: async () => {},
          url: () => "https://example.com/landed",
          close: async () => {},
        }),
      }),
    }),
  }),
  { virtual: true },
);

const getPageWithCamoufox = require("../get-page-with-camoufox");

const playwrightResponse = (status, headers = {}) => ({
  status: () => status,
  headers: () => headers,
});

const selectorTimeout = async () => {
  throw new Error("waiting for selector `#content` timed out");
};

describe("getPageWithCamoufox bot refusals", () => {
  let logs;

  beforeEach(() => {
    logs = [];
    jest.spyOn(console, "log").mockImplementation((line) => logs.push(line));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const refusalLogs = () => logs.filter((line) => line.includes("🤖"));

  it("logs a challenged navigation even when the page then loads", async () => {
    mockNavigation = {
      response: playwrightResponse(403, { "cf-mitigated": "challenge" }),
      content: "<main>listings</main>",
    };

    await getPageWithCamoufox("https://example.com/", "key", (page) =>
      page.content(),
    );

    expect(refusalLogs()).toEqual([
      "      - 🤖 Bot 403 challenge (cloudflare, via cf-mitigated) at https://example.com/",
    ]);
  });

  it("says a missing selector was a challenge page", async () => {
    mockNavigation = {
      response: playwrightResponse(403),
      content: "<title>Just a moment...</title>",
    };

    await expect(
      getPageWithCamoufox("https://example.com/", "key", selectorTimeout),
    ).rejects.toThrow("timed out");

    expect(refusalLogs()).toEqual([
      "      - 🤖 Bot 403 challenge (unknown vendor, via response-text) at https://example.com/landed",
    ]);
  });

  it("logs a challenge once, from its header, when the selector then fails", async () => {
    mockNavigation = {
      response: playwrightResponse(403, { "cf-mitigated": "challenge" }),
      content: "<title>Just a moment...</title>",
    };

    await expect(
      getPageWithCamoufox("https://example.com/", "key", selectorTimeout),
    ).rejects.toThrow("timed out");

    expect(refusalLogs()).toHaveLength(1);
  });

  it("logs nothing when a good page is missing its selector", async () => {
    mockNavigation = {
      response: playwrightResponse(200),
      content: "<h1>Just a Moment</h1>",
    };

    await expect(
      getPageWithCamoufox("https://example.com/", "key", selectorTimeout),
    ).rejects.toThrow("timed out");

    expect(refusalLogs()).toEqual([]);
  });
});
