const retrieve = require("../retrieve");

// Hands the retrieve's callback a page whose `evaluate` runs the in-page code
// here, against the mocked global `fetch`.
jest.mock("../../../common/get-page-with-playwright", () =>
  jest.fn(async (url, cacheKey, callback) =>
    callback({
      waitForLoadState: async () => {},
      evaluate: async (fn, arg) => fn(arg),
    }),
  ),
);

// The listing arrives as an HTML fragment inside a JSON string.
const listing = (paths) =>
  JSON.stringify(
    paths
      .map(
        (href) =>
          `<div class="eventItem"><h3 class="title"><a href="${href}"></a></h3></div>`,
      )
      .join(""),
  );

describe("the O2 retrieve from inside the page", () => {
  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("pages through the listing and fetches each event", async () => {
    global.fetch = jest.fn(async (url) => {
      if (url.includes("/events_ajax/0")) {
        return new Response(listing(["/events/detail/a-film"]));
      }
      if (url.includes("/events_ajax/")) return new Response(listing([]));
      return new Response("<html>event</html>");
    });

    const { movieListPages, moviePages } = await retrieve();

    expect(movieListPages).toHaveLength(1);
    expect(moviePages).toEqual({
      "/events/detail/a-film": "<html>event</html>",
    });
    expect(global.fetch.mock.calls[0][1]).toEqual({
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
  });

  it("fails on the WAF's bare 406, naming the status", async () => {
    global.fetch = jest.fn(
      async () =>
        new Response("", { status: 406, statusText: "Not Acceptable" }),
    );

    await expect(retrieve()).rejects.toThrow("failed - 406 Not Acceptable");
  });
});
