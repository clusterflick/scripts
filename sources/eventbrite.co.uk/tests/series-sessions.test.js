const { disableCache } = require("../../../common/test-utils");

// Passthrough the daily cache so each fetch really goes through the mocked
// fetch below, rather than reading or writing cache files on disk.
jest.mock("../../../common/cache");
disableCache();

// Stubbed out: seeding is organizer-sweep.test.js's business.
jest.mock("../seeded-organizers", () => []);

const retrieve = require("../retrieve");
const griffin = require("./fixtures/griffin-halloween.json");

const SEARCH_URL_PATTERN = /\/d\/united-kingdom--london\//;
const SERIES_URL_PATTERN = /\/api\/v3\/series\/(\d+)\/events\//;

// No `primary_organizer_id`, so the organiser sweep stays out of it.
const searchEvent = { ...griffin.event, primary_organizer_id: undefined };

const searchPage = (events) =>
  `<script> window.__SERVER_DATA__ = ${JSON.stringify({
    page_count: 1,
    search_data: { events: { results: events } },
  })};</script>`;

const eventPage = (details) =>
  `<script> window.__SERVER_DATA__ = ${JSON.stringify(details)};</script>`;

const response = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: "",
  headers: { get: () => null },
  text: async () => body,
  json: async () => JSON.parse(body),
});

const runRetrieve = async () => {
  const settled = retrieve().then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await jest.runAllTimersAsync();
  return settled;
};

describe("eventbrite series sessions", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // The Griffin's page, and the same page reassigned to a series nobody has
  // allow-listed, for a search that reached one session of each.
  const otherDetails = JSON.parse(JSON.stringify(griffin.details));
  otherDetails.props.pageProps.context.basicInfo.seriesId = "1234567890";
  const otherEvent = {
    ...searchEvent,
    id: "1234567891",
    url: "https://www.eventbrite.com/e/other-tickets-1234567891",
  };

  const mockFetch = (seriesResponse) => {
    const seriesRequests = [];
    global.fetch = jest.fn(async (url) => {
      if (SEARCH_URL_PATTERN.test(url))
        return response(200, searchPage([searchEvent, otherEvent]));
      if (SERIES_URL_PATTERN.test(url)) {
        seriesRequests.push(url);
        return response(200, JSON.stringify(seriesResponse(url)));
      }
      if (url === otherEvent.url) return response(200, eventPage(otherDetails));
      return response(200, eventPage(griffin.details));
    });
    return seriesRequests;
  };

  it("fetches the current and future sessions of every series", async () => {
    const seriesRequests = mockFetch(() => ({
      pagination: { has_more_items: false },
      events: griffin.sessions,
    }));

    const { value, error } = await runRetrieve();

    expect(error).toBeUndefined();
    expect(seriesRequests).toEqual([
      "https://www.eventbrite.co.uk/api/v3/series/2002714960358/events/?time_filter=current_future&page=1",
      "https://www.eventbrite.co.uk/api/v3/series/1234567890/events/?time_filter=current_future&page=1",
    ]);
    expect(value.seriesEvents).toEqual({
      2002714960358: griffin.sessions,
      1234567890: griffin.sessions,
    });
  }, 15000);

  it("pages through a series longer than one page", async () => {
    const seriesRequests = mockFetch((url) => {
      const page = Number(new URL(url).searchParams.get("page"));
      return {
        pagination: { has_more_items: page < 2 },
        events:
          page === 1 ? griffin.sessions.slice(0, 3) : griffin.sessions.slice(3),
      };
    });

    const { value, error } = await runRetrieve();

    expect(error).toBeUndefined();
    expect(seriesRequests).toHaveLength(4);
    expect(value.seriesEvents[2002714960358]).toEqual(griffin.sessions);
  }, 15000);

  it("fails rather than read part of a series that never ends", async () => {
    mockFetch(() => ({
      pagination: { has_more_items: true },
      events: griffin.sessions,
    }));

    const { error } = await runRetrieve();

    expect(error.message).toMatch(
      /Series 2002714960358 still reported more sessions after 20 pages/,
    );
  }, 15000);

  it("fails when a series answers without a list of sessions", async () => {
    mockFetch(() => ({ error: "NOT_FOUND" }));

    const { error } = await runRetrieve();

    expect(error.message).toMatch(
      /Series 2002714960358 returned no list of sessions/,
    );
  }, 15000);
});
