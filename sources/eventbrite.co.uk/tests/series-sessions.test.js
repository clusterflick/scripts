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

  it("fetches the sessions of a series whose line-up is expanded", async () => {
    const seriesFetched = [];
    global.fetch = jest.fn(async (url) => {
      if (SEARCH_URL_PATTERN.test(url))
        return response(200, searchPage([searchEvent]));
      const series = url.match(SERIES_URL_PATTERN);
      if (series) {
        seriesFetched.push(series[1]);
        return response(
          200,
          JSON.stringify({
            pagination: { has_more_items: false },
            events: griffin.sessions,
          }),
        );
      }
      return response(200, eventPage(griffin.details));
    });

    const { value, error } = await runRetrieve();

    expect(error).toBeUndefined();
    expect(seriesFetched).toEqual(["2002714960358"]);
    expect(value.seriesEvents).toEqual({ 2002714960358: griffin.sessions });
  }, 15000);

  it("leaves every other series alone", async () => {
    const details = JSON.parse(JSON.stringify(griffin.details));
    details.props.pageProps.context.basicInfo.seriesId = "1234567890";

    global.fetch = jest.fn(async (url) => {
      if (SEARCH_URL_PATTERN.test(url))
        return response(200, searchPage([searchEvent]));
      if (SERIES_URL_PATTERN.test(url))
        throw new Error(`Unexpected series request: ${url}`);
      return response(200, eventPage(details));
    });

    const { value, error } = await runRetrieve();

    expect(error).toBeUndefined();
    expect(value.seriesEvents).toEqual({});
  }, 15000);

  it("fails rather than read part of a series", async () => {
    global.fetch = jest.fn(async (url) => {
      if (SEARCH_URL_PATTERN.test(url))
        return response(200, searchPage([searchEvent]));
      if (SERIES_URL_PATTERN.test(url))
        return response(
          200,
          JSON.stringify({
            pagination: { has_more_items: true },
            events: griffin.sessions,
          }),
        );
      return response(200, eventPage(griffin.details));
    });

    const { error } = await runRetrieve();

    expect(error.message).toMatch(
      /Series 2002714960358 has more sessions than one page holds/,
    );
  }, 15000);
});
