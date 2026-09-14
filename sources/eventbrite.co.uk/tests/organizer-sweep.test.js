const { disableCache } = require("../../../common/test-utils");

jest.mock("../../../common/cache");
disableCache();

// Stubbed rather than read: this file is about what the sweep does with an id,
// not who is on the real list. Prefixed `mock` so jest's hoisting lets the
// factory close over it, and left empty so only the seeding test adds one.
const mockSeededOrganizerIds = [];
jest.mock("../seeded-organizers", () => mockSeededOrganizerIds);

const retrieve = require("../retrieve");

const SEARCH_URL_PATTERN = /\/d\/united-kingdom--london\//;
const ORGANIZER_URL_PATTERN = /\/organizer-profile\/api\/organizers\//;

const ORGANIZER_ID = "110405962451";

// Genesis Cinema, matching cinemas/genesiscinema.co.uk - the events have to sit
// at a venue we hold or retrieve skips them before the sweep runs.
const venue = () => ({
  name: "Genesis Cinema",
  address: {
    latitude: "51.52128726645794",
    longitude: "-0.051143457671891594",
    localized_address_display: "93-95 Mile End Road, London, E1 4UJ",
  },
});

const searchEvent = (id) => ({
  id,
  name: `Screening ${id}`,
  url: `https://www.eventbrite.co.uk/e/event-${id}`,
  primary_organizer_id: ORGANIZER_ID,
  primary_venue: venue(),
});

// What the organiser endpoint returns: no tags, an empty summary and
// tickets_url, and an end_time copied from start_time.
const organizerEvent = (id, name = `Screening ${id}`) => ({
  id,
  name,
  url: `https://www.eventbrite.co.uk/e/event-${id}`,
  primary_organizer_id: ORGANIZER_ID,
  primary_venue: venue(),
  start_date: "2025-11-20",
  start_time: "17:00:00",
  end_date: "2025-11-20",
  end_time: "17:00:00",
  summary: "",
  tickets_url: "",
  is_cancelled: false,
  is_online_event: false,
});

const searchPage = (events) =>
  `<script> window.__SERVER_DATA__ = ${JSON.stringify({
    page_count: 1,
    search_data: { events: { results: events } },
  })};</script>`;

const eventPage = (id) =>
  `<script> window.__SERVER_DATA__ = ${JSON.stringify({
    props: {
      pageProps: {
        context: {
          basicInfo: {
            id,
            name: `Event ${id}`,
            summary: "A film, screened.",
            startDate: { local: "2025-11-20T17:00:00" },
            endDate: { local: "2025-11-20T19:00:00" },
          },
        },
      },
    },
  })};</script>`;

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

describe("eventbrite organiser sweep", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    mockSeededOrganizerIds.length = 0;
  });

  it("recovers an organiser's events that the search did not reach", async () => {
    global.fetch = jest.fn(async (url) => {
      if (SEARCH_URL_PATTERN.test(url))
        return response(200, searchPage([searchEvent("1")]));
      if (ORGANIZER_URL_PATTERN.test(url))
        return response(
          200,
          JSON.stringify({
            events: [organizerEvent("1"), organizerEvent("2")],
            has_more: false,
          }),
        );
      return response(200, eventPage(url.split("event-")[1]));
    });

    const { value, error } = await runRetrieve();

    expect(error).toBeUndefined();
    // Event 1 came from the search, so only event 2 is new.
    expect(value.organizerEvents).toHaveLength(1);
    expect(value.organizerEvents[0]).toMatchObject({
      id: "2",
      start_date: "2025-11-20",
      start_time: "17:00",
      end_date: "2025-11-20",
      end_time: "19:00",
      summary: "A film, screened.",
      tickets_url: "https://www.eventbrite.com/checkout-external?eid=2",
    });
  }, 15000);

  // Organiser 15241684138 - a national bookshop events account with 697 events,
  // eleven of them at a venue we hold - keeps reporting hasMore once its total
  // is exhausted. A page cap alone failed the whole retrieve on it, so the
  // total is what bounds the paging.
  it("stops paging an organiser once their reported total is collected", async () => {
    const PAGE_SIZE = 12;
    const TOTAL = 25;
    const organizerPagesFetched = [];

    global.fetch = jest.fn(async (url) => {
      if (SEARCH_URL_PATTERN.test(url))
        return response(200, searchPage([searchEvent("1")]));

      if (ORGANIZER_URL_PATTERN.test(url)) {
        const page = Number(url.match(/[?&]page=(\d+)/)[1]);
        organizerPagesFetched.push(page);
        const collectedBefore = (page - 1) * PAGE_SIZE;
        const count = Math.max(0, Math.min(PAGE_SIZE, TOTAL - collectedBefore));
        return response(
          200,
          JSON.stringify({
            events: Array.from({ length: count }, (_, i) =>
              organizerEvent(`${100 + collectedBefore + i}`),
            ),
            // Deliberately never false - this is the endpoint's actual
            // behaviour for this organiser.
            has_more: true,
            hasMore: true,
            ...(page > 1 ? { total: TOTAL } : {}),
          }),
        );
      }

      return response(200, eventPage(url.split("event-")[1]));
    });

    const { value, error } = await runRetrieve();

    expect(error).toBeUndefined();
    // 12 + 12 + 1 reaches the total on the third page, and it stops there
    // rather than running to the runaway guard.
    expect(organizerPagesFetched).toEqual([1, 2, 3]);
    expect(value.organizerEvents).toHaveLength(TOTAL);
  }, 15000);

  // An organiser's calendar is everything they run, not just their films, so
  // the whole programme arrives here - concerts at Union Chapel, life drawing
  // at a meeting house. 429 of 507 recovered events were not films.
  it("leaves an organiser's non-film events alone", async () => {
    const eventPagesFetched = [];

    global.fetch = jest.fn(async (url) => {
      if (SEARCH_URL_PATTERN.test(url))
        return response(200, searchPage([searchEvent("1")]));

      if (ORGANIZER_URL_PATTERN.test(url))
        return response(
          200,
          JSON.stringify({
            events: [
              organizerEvent("2", "Cinema Club - The Nun (2018)"),
              organizerEvent("3", "Kids' Film Club @Leyton Library"),
              organizerEvent("4", "The Phantom of the Opera (1925)"),
              organizerEvent("5", "Life Drawing Classes at the Meeting House"),
              organizerEvent("6", "Pilates"),
              organizerEvent("7", "Wreath Making"),
            ],
            has_more: false,
          }),
        );

      eventPagesFetched.push(url);
      return response(200, eventPage(url.split("event-")[1]));
    });

    const { value, error } = await runRetrieve();

    expect(error).toBeUndefined();
    expect(value.organizerEvents.map(({ name }) => name)).toEqual([
      "Cinema Club - The Nun (2018)",
      "Kids' Film Club @Leyton Library",
      // Caught only by the bracketed year - no film word in the title.
      "The Phantom of the Opera (1925)",
    ]);
    // The filter runs on the listing, so the three that were dropped never
    // cost an event-page request. Event 1 is the search's own.
    expect(eventPagesFetched).toHaveLength(4);
  }, 15000);
  // An organiser the search omits entirely hands us no id to discover, so the
  // seed list is the only route to them.
  it("asks a seeded organiser the search never surfaced", async () => {
    const SEEDED_ID = "114851363951";
    mockSeededOrganizerIds.push(SEEDED_ID);
    const organizersAsked = [];

    global.fetch = jest.fn(async (url) => {
      // The search finds nothing at a venue we hold, so it contributes no
      // organiser of its own.
      if (SEARCH_URL_PATTERN.test(url)) return response(200, searchPage([]));

      if (ORGANIZER_URL_PATTERN.test(url)) {
        organizersAsked.push(url.match(/organizers\/(\d+)\//)[1]);
        return response(
          200,
          JSON.stringify({
            events: [
              organizerEvent("2", "Visions of Desire by Erotic Film Festival"),
            ],
            has_more: false,
          }),
        );
      }

      return response(200, eventPage(url.split("event-")[1]));
    });

    const { value, error } = await runRetrieve();

    expect(error).toBeUndefined();
    expect(organizersAsked).toEqual([SEEDED_ID]);
    expect(value.organizerEvents).toHaveLength(1);
    expect(value.organizerEvents[0]).toMatchObject({
      id: "2",
      name: "Visions of Desire by Erotic Film Festival",
    });
  }, 15000);

  // A seeded id outlives the organiser that justified it, and the error is the
  // only thing that can say the fix is ours rather than Eventbrite's.
  it("names the seed list when a seeded organiser cannot be read", async () => {
    mockSeededOrganizerIds.push("999");

    global.fetch = jest.fn(async (url) => {
      if (SEARCH_URL_PATTERN.test(url)) return response(200, searchPage([]));
      if (ORGANIZER_URL_PATTERN.test(url)) return response(404, "");
      return response(200, eventPage(url.split("event-")[1]));
    });

    const { error } = await runRetrieve();

    expect(error).toBeDefined();
    expect(error.message).toContain("Seeded organiser 999");
    expect(error.message).toContain("seeded-organizers.js");
    expect(error.cause).toBeDefined();
  }, 15000);
});
