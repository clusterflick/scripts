const retrieve = require("../retrieve");

// Hands the retrieve's callback a page whose `evaluate` runs the in-page code
// here, against the mocked global `fetch`.
jest.mock("../../get-page-with-playwright", () =>
  jest.fn(async (url, cacheKey, callback) =>
    callback({
      waitForLoadState: async () => {},
      locator: () => ({ waitFor: async () => {} }),
      evaluate: async (fn, arg) => fn(arg),
    }),
  ),
);

const venue = {
  domain: "https://www.myvue.com",
  url: "https://www.myvue.com/cinema/islington",
  cinemaId: "10032",
};

describe("myvue retrieve from inside the page", () => {
  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns the films the API answered with", async () => {
    const data = { responseCode: 0, result: [{ filmId: "1" }] };
    global.fetch = jest.fn(async () => new Response(JSON.stringify(data)));

    await expect(retrieve(venue)).resolves.toEqual(data);
  });

  it("still reports an API error from its JSON body", async () => {
    global.fetch = jest.fn(
      async () =>
        new Response(
          JSON.stringify({ responseCode: 1, errorMessage: "Unauthorised" }),
          { status: 401 },
        ),
    );

    await expect(retrieve(venue)).rejects.toThrow(
      "MyVue API error for cinema 10032: Unauthorised (responseCode: 1)",
    );
  });

  it("says which refusal answered without JSON", async () => {
    global.fetch = jest.fn(
      async () =>
        new Response("<title>Just a moment...</title>", {
          status: 403,
          headers: { "cf-mitigated": "challenge" },
        }),
    );

    await expect(retrieve(venue)).rejects.toThrow(
      "without JSON - 403 challenge (cloudflare, via cf-mitigated)",
    );
  });
});
