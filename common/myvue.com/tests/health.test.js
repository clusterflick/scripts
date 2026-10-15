const health = require("../health");

// Hands the probe's callback a page whose `evaluate` runs the in-page tally
// here, against the mocked global `fetch`.
jest.mock("../../get-page-with-playwright", () => ({
  withPlaywrightSession: async (fn) =>
    fn((url, cacheKey, callback) =>
      callback(
        {
          waitForLoadState: async () => {},
          locator: () => ({ count: async () => 1, waitFor: async () => {} }),
          evaluate: async (fn, arg) => fn(arg),
        },
        null,
      ),
    ),
}));

const venues = [
  {
    id: "myvue.com-islington",
    cinemaId: "10032",
    url: "https://www.myvue.com/cinema/islington",
  },
  {
    id: "myvue.com-west-end",
    cinemaId: "10026",
    url: "https://www.myvue.com/cinema/west-end",
  },
];

const cinemaList = {
  result: [{ cinemas: venues.map(({ cinemaId }) => ({ cinemaId })) }],
};

const films = {
  responseCode: 0,
  result: [
    {
      filmId: "1",
      showingGroups: [
        { sessions: [{ showTimeWithTimeZone: "2026-10-16T18:00:00+01:00" }] },
      ],
    },
  ],
};

// Islington answers with its films; West End with whatever the case supplies.
const respondWith = (westEnd) => {
  global.fetch = jest.fn(async (url) => {
    if (url.endsWith("/showings/cinemas")) {
      return new Response(JSON.stringify(cinemaList));
    }
    if (url.includes("/cinemas/10032/")) {
      return new Response(JSON.stringify(films));
    }
    return westEnd();
  });
};

const reasons = (rows) =>
  Object.fromEntries(rows.map(({ venue, reason }) => [venue, reason]));

describe("myvue health from inside the page", () => {
  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("records a challenged venue as a bot challenge", async () => {
    respondWith(
      () =>
        new Response("<title>Just a moment...</title>", {
          status: 403,
          headers: { "cf-mitigated": "challenge" },
        }),
    );

    const rows = await health(venues);

    expect(reasons(rows)).toEqual({
      "myvue.com-islington": null,
      "myvue.com-west-end": {
        kind: "bot-challenge",
        via: "cf-mitigated",
        status: 403,
      },
    });
    expect(rows[0].counts).toEqual({ performances: 1, films: 1, dates: 1 });
  });

  it("records a block page that isn't JSON from its text", async () => {
    respondWith(
      () => new Response("Sorry, you have been blocked", { status: 403 }),
    );

    expect(reasons(await health(venues))["myvue.com-west-end"]).toEqual({
      kind: "bot-challenge",
      via: "response-text",
      status: 403,
    });
  });

  it("still records an ordinary API error as the probe's own", async () => {
    respondWith(
      () => new Response(JSON.stringify({ responseCode: 1 }), { status: 500 }),
    );

    expect(reasons(await health(venues))["myvue.com-west-end"]).toEqual({
      kind: "probe-error",
      message: "responded 500 with responseCode 1",
    });
  });
});
