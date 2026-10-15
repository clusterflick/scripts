const ocapiv1Retrieve = require("../../ocapi-v1/retrieve");
const retrieve = require("../retrieve");

// Hands the retrieve's callback a page whose `evaluate` runs the in-page code
// here, against the mocked global `fetch` and `window`.
jest.mock("../../get-page-with-playwright", () =>
  jest.fn(async (url, cacheKey, callback) =>
    callback({
      waitForLoadState: async () => {},
      evaluate: async (fn, arg) => fn(arg),
    }),
  ),
);
jest.mock("../../ocapi-v1/retrieve", () => jest.fn(async () => ["showtimes"]));

const attributes = {
  id: "curzon.com-soho",
  domain: "https://www.curzon.com",
  url: "https://www.curzon.com/venues/soho",
};

const pageData = { vistaCinema: { key: "SOH1" } };
const api = { url: "https://digital-api.curzon.com", authToken: "token" };

describe("curzon retrieve page data from inside the page", () => {
  beforeEach(() => {
    global.window = { initialData: { api } };
    ocapiv1Retrieve.mockClear();
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    delete global.window;
    jest.restoreAllMocks();
  });

  it("reads the cinema id off the page data", async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify(pageData)));

    await expect(retrieve(attributes)).resolves.toEqual(["showtimes"]);
    expect(ocapiv1Retrieve).toHaveBeenCalledWith(
      expect.objectContaining({ cinemaId: "SOH1" }),
      api,
    );
  });

  it("asks once more when the first answer isn't JSON", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response("<html>error</html>", { status: 500 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(pageData)));

    await expect(retrieve(attributes)).resolves.toEqual(["showtimes"]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("says which refusal answered twice without JSON", async () => {
    global.fetch = jest.fn(
      async () => new Response("Sorry, you have been blocked", { status: 403 }),
    );

    await expect(retrieve(attributes)).rejects.toThrow(
      "without JSON - 403 block (unknown vendor, via response-text)",
    );
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
