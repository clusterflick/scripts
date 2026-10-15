const { disableCache } = require("../../../common/test-utils");

// Passthrough the daily cache so each fetch really goes through the mocked
// fetch below, rather than reading or writing cache files on disk.
jest.mock("../../../common/cache");
disableCache();

// Stubbed out: an id added to the seed list later would ask for a calendar
// these fixtures never captured. Seeding is organizer-sweep.test.js's business.
jest.mock("../seeded-organizers", () => []);

const retrieve = require("../retrieve");

const SEARCH_URL_PATTERN = /\/d\/united-kingdom--london\//;

const searchPage = (events) =>
  `<script> window.__SERVER_DATA__ = ${JSON.stringify({
    page_count: 1,
    search_data: { events: { results: events } },
  })};</script>`;

const eventPage = (id) =>
  `<script> window.__SERVER_DATA__ = ${JSON.stringify({ id })};</script>`;

// Retrieve only fetches a page for an event at a venue we hold, so these have
// to sit at a real one or they'd be skipped before any of the retry behaviour
// below gets a chance to run. Genesis Cinema, matching the attributes in
// cinemas/genesiscinema.co.uk. No `primary_organizer_id`: that would send the
// organiser sweep off making calls these tests have nothing to say about.
const makeEvent = (id) => ({
  id,
  url: `https://www.eventbrite.co.uk/e/event-${id}`,
  primary_venue: {
    name: "Genesis Cinema",
    address: {
      latitude: "51.52128726645794",
      longitude: "-0.051143457671891594",
      localized_address_display: "93-95 Mile End Road, London, E1 4UJ",
    },
  },
});

// The one allow-listed line-up event in expand-line-up-events.js, whose
// screenings are read out of its description and nowhere else.
const LINE_UP_EVENT_ID = "1996329278612";

const describedEventPage = (modules) =>
  `<script> window.__SERVER_DATA__ = ${JSON.stringify({
    props: { pageProps: { context: { structuredContent: { modules } } } },
  })};</script>`;

const lineUpModules = [{ type: "text", text: "<p>Here is the line up!</p>" }];

const response = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: "",
  headers: { get: () => null },
  text: async () => body,
});

const networkError = () => {
  const error = new TypeError("fetch failed");
  error.cause = Object.assign(new Error("read ECONNRESET"), {
    code: "ECONNRESET",
  });
  return error;
};

// Both searches run, so serve the same single page of events to each.
const setupFetch = (events, eventHandler) => {
  global.fetch = jest.fn(async (url) => {
    if (SEARCH_URL_PATTERN.test(url)) return response(200, searchPage(events));
    return eventHandler(url);
  });
};

const runRetrieve = async () => {
  const settled = retrieve().then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await jest.runAllTimersAsync();
  return settled;
};

// Each case pays for `getAllCinemaAttributes()`, which requires all 400-odd
// cinema modules - a few hundred milliseconds here, and several seconds on a
// loaded CI runner. The fake clock does not cover that: Jest's own timeout runs
// on real time, so the default 5s is not enough and every case names its own,
// as the organiser sweep's cases do.
const TEST_TIMEOUT_MS = 15_000;

describe("eventbrite deferred retry", () => {
  let logs;

  beforeEach(() => {
    jest.useFakeTimers();
    logs = [];
    jest.spyOn(console, "log").mockImplementation((line) => logs.push(line));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it(
    "recovers an event that was unreachable during the main loop",
    async () => {
      const events = [makeEvent("1"), makeEvent("2")];
      // Event 2 is unreachable for every attempt of the main loop's inline retry
      // budget, then comes back — exactly the shape seen in production, where the
      // condition outlasts the inline retries but has cleared by the sweep.
      let attemptsAtEvent2 = 0;
      setupFetch(events, async (url) => {
        if (!url.endsWith("event-2")) return response(200, eventPage("1"));
        attemptsAtEvent2 += 1;
        if (attemptsAtEvent2 <= 4) throw networkError();
        return response(200, eventPage("2"));
      });

      const { value, error } = await runRetrieve();

      expect(error).toBeUndefined();
      expect(Object.keys(value.moviePages)).toHaveLength(2);
      expect(
        value.moviePages["https://www.eventbrite.co.uk/e/event-2"],
      ).toEqual({
        id: "2",
      });
      // It must be the deferred sweep that recovered it, not a longer inline
      // budget — the inline retries are deliberately short precisely because the
      // sweep is what does the work.
      expect(logs).toContain(" - Retrying 1 unreachable event...");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "recovers an event whose page first arrived without its data",
    async () => {
      const events = [makeEvent("1"), makeEvent("2")];
      // A 200 with neither `__SERVER_DATA__` nor `__NEXT_DATA__` used to be
      // stored as a `null` page. It has to be retried like any other failure.
      let attemptsAtEvent2 = 0;
      setupFetch(events, async (url) => {
        if (!url.endsWith("event-2")) return response(200, eventPage("1"));
        attemptsAtEvent2 += 1;
        if (attemptsAtEvent2 === 1) return response(200, "<html></html>");
        return response(200, eventPage("2"));
      });

      const { value, error } = await runRetrieve();

      expect(error).toBeUndefined();
      expect(Object.keys(value.moviePages)).toHaveLength(2);
      expect(
        value.moviePages["https://www.eventbrite.co.uk/e/event-2"],
      ).toEqual({ id: "2" });
      expect(logs).toContain(" - Retrying 1 unreachable event...");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "fails loudly when an event page never carries its data",
    async () => {
      const events = [makeEvent("1"), makeEvent("2")];
      setupFetch(events, async (url) =>
        url.endsWith("event-2")
          ? response(200, "<html></html>")
          : response(200, eventPage("1")),
      );

      const { error } = await runRetrieve();

      expect(error).toBeDefined();
      expect(error.message).toContain("Could not reach 1 event page(s)");
      expect(error.message).toContain("event-2");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "drops a removed event without deferring it",
    async () => {
      const events = [makeEvent("1"), makeEvent("2")];
      setupFetch(events, async (url) =>
        url.endsWith("event-2")
          ? response(404, "")
          : response(200, eventPage("1")),
      );

      const { value, error } = await runRetrieve();

      expect(error).toBeUndefined();
      expect(Object.keys(value.moviePages)).toHaveLength(1);
      // A 404 is definitive, so it must not be retried by the sweep.
      const event2Calls = global.fetch.mock.calls.filter(([url]) =>
        url.endsWith("event-2"),
      );
      expect(event2Calls).toHaveLength(1);
      expect(logs.some((line) => line.includes("Retrying"))).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "fails loudly when an event is still unreachable after the sweep",
    async () => {
      const events = [makeEvent("1"), makeEvent("2")];
      setupFetch(events, async (url) => {
        if (url.endsWith("event-2")) throw networkError();
        return response(200, eventPage("1"));
      });

      const { error } = await runRetrieve();

      // Previously this silently dropped the event and shipped a thinner dataset.
      expect(error).toBeDefined();
      expect(error.message).toContain("Could not reach 1 event page(s)");
      expect(error.message).toContain("event-2");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "recovers a line-up event whose page first arrived without its description",
    async () => {
      const events = [makeEvent("1"), makeEvent(LINE_UP_EVENT_ID)];
      // The shape seen on 15th October 2026: the page parses, but its
      // description modules are empty.
      let attemptsAtLineUp = 0;
      setupFetch(events, async (url) => {
        if (!url.endsWith(LINE_UP_EVENT_ID))
          return response(200, eventPage("1"));
        attemptsAtLineUp += 1;
        return response(
          200,
          describedEventPage(attemptsAtLineUp === 1 ? [] : lineUpModules),
        );
      });

      const { value, error } = await runRetrieve();

      expect(error).toBeUndefined();
      expect(Object.keys(value.moviePages)).toHaveLength(2);
      expect(
        value.moviePages[
          `https://www.eventbrite.co.uk/e/event-${LINE_UP_EVENT_ID}`
        ].props.pageProps.context.structuredContent.modules,
      ).toEqual(lineUpModules);
      expect(logs).toContain(" - Retrying 1 unreachable event...");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "fails loudly when a line-up event never carries its description",
    async () => {
      const events = [makeEvent("1"), makeEvent(LINE_UP_EVENT_ID)];
      setupFetch(events, async (url) =>
        url.endsWith(LINE_UP_EVENT_ID)
          ? response(200, describedEventPage([]))
          : response(200, eventPage("1")),
      );

      const { error } = await runRetrieve();

      expect(error).toBeDefined();
      expect(error.message).toContain("Could not reach 1 event page(s)");
      expect(error.message).toContain(`event-${LINE_UP_EVENT_ID}`);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "accepts an empty description on an event that is not a line-up",
    async () => {
      const events = [makeEvent("1"), makeEvent("2")];
      // Plenty of listings have no description, and nothing reads one from
      // them, so they must not be retried for it.
      setupFetch(events, async (url) =>
        response(
          200,
          url.endsWith("event-2") ? describedEventPage([]) : eventPage("1"),
        ),
      );

      const { value, error } = await runRetrieve();

      expect(error).toBeUndefined();
      expect(Object.keys(value.moviePages)).toHaveLength(2);
      expect(logs.some((line) => line.includes("Retrying"))).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );
});
