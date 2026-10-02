const { schemaValidate } = require("../../../common/test-utils");
const {
  readJSON,
  removeMatchingHints,
  addTestCategory,
} = require("../../../common/utils");
const findEvents = require("../find-events");
const griffinAttributes = require("../../../cinemas/griffinwhetstone.pub/attributes");
const griffin = require("./fixtures/griffin-halloween.json");

jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  readJSON: jest.fn(),
}));

// The Griffin's series is captured with every one of its sessions, so it stands
// in for any series: reassigned to an id nobody has allow-listed, it takes the
// path every other series does rather than having its line-up read.
const SERIES_ID = "1234567890";

const clone = (value) => JSON.parse(JSON.stringify(value));

const seriesDetails = () => {
  const details = clone(griffin.details);
  details.props.pageProps.context.basicInfo.seriesId = SERIES_ID;
  return details;
};

const withRetrieved = ({
  events = [griffin.event],
  details = seriesDetails(),
  sessions = griffin.sessions,
  organizerEvents = [],
} = {}) =>
  readJSON.mockImplementation(async () => ({
    movieListPages: [{ search_data: { events: { results: events } } }],
    moviePages: Object.fromEntries(
      [...events, ...organizerEvents].map(({ url }) => [url, details]),
    ),
    organizerEvents,
    seriesEvents: sessions === null ? {} : { [SERIES_ID]: sessions },
  }));

const sessionTimes = (output) =>
  output.map(({ showingId, performances: [performance] }) => [
    showingId,
    new Date(performance.time).toISOString(),
  ]);

describe("eventbrite series expansion", () => {
  it("publishes every session of a series the search reached one of", async () => {
    withRetrieved();

    const output = await findEvents(griffinAttributes);

    expect(sessionTimes(output)).toEqual([
      ["eventbrite.co.uk-2002715002484", "2026-10-26T19:00:00.000Z"],
      ["eventbrite.co.uk-2002715003487", "2026-10-27T19:00:00.000Z"],
      ["eventbrite.co.uk-2002715004490", "2026-10-28T19:00:00.000Z"],
      ["eventbrite.co.uk-2002715005493", "2026-10-29T19:00:00.000Z"],
      ["eventbrite.co.uk-2002715006496", "2026-10-30T19:00:00.000Z"],
    ]);
    // The series names no film per session, so each keeps the title it
    // displays rather than being claimed as another night of one film.
    expect(new Set(output.map(({ title }) => title))).toEqual(
      new Set(["HALLOWEEN ON THE SCREEN AT THE GRIFFIN"]),
    );

    const data = clone(output).map(removeMatchingHints).map(addTestCategory);
    expect(schemaValidate(data)).toBe(true);
    expect(data).toMatchSnapshot();
  });

  it("publishes a session the search reached exactly as it did before", async () => {
    const notASeries = seriesDetails();
    notASeries.props.pageProps.context.basicInfo.isSeries = false;
    withRetrieved({ details: notASeries });
    const [before] = await findEvents(griffinAttributes);

    withRetrieved();
    const [reached] = await findEvents(griffinAttributes);

    expect(reached).toEqual(before);
  });

  it("takes each unreached session's own checkout, and claims no availability for it", async () => {
    withRetrieved();

    const [reached, ...unreached] = await findEvents(griffinAttributes);

    expect(reached.performances[0].status).toEqual({ soldOut: false });
    expect(
      unreached.map(({ url, performances: [{ bookingUrl, status }] }) => ({
        url,
        bookingUrl,
        status,
      })),
    ).toEqual(
      griffin.sessions.slice(1).map(({ id, url }) => ({
        url,
        bookingUrl: `https://www.eventbrite.com/checkout-external?eid=${id}`,
        status: {},
      })),
    );
  });

  it("publishes the sessions, not the row, for an organiser's collapsed series", async () => {
    // The organiser calendar can list a series as one row whose id is the
    // series' own; its page then carries the series' first ever date.
    const details = seriesDetails();
    details.props.pageProps.context.basicInfo.id = SERIES_ID;
    const collapsedRow = {
      ...griffin.event,
      id: SERIES_ID,
      url: `https://www.eventbrite.com/e/halloween-tickets-${SERIES_ID}`,
      start_date: "2023-05-27",
    };
    withRetrieved({ events: [], organizerEvents: [collapsedRow], details });

    const output = await findEvents(griffinAttributes);

    expect(output.map(({ showingId }) => showingId)).toEqual(
      griffin.sessions.map(({ id }) => `eventbrite.co.uk-${id}`),
    );
  });

  it("publishes each series once however many of its sessions were reached", async () => {
    const second = {
      ...griffin.event,
      id: griffin.sessions[1].id,
      url: griffin.sessions[1].url,
    };
    withRetrieved({ events: [griffin.event, second] });

    const output = await findEvents(griffinAttributes);

    expect(output).toHaveLength(5);
  });

  it("skips a cancelled session", async () => {
    const sessions = clone(griffin.sessions);
    sessions[2].status = "canceled";
    withRetrieved({ sessions });

    const output = await findEvents(griffinAttributes);

    expect(output.map(({ showingId }) => showingId)).not.toContain(
      `eventbrite.co.uk-${sessions[2].id}`,
    );
    expect(output).toHaveLength(4);
  });

  it("throws on a session status nobody has decided how to publish", async () => {
    const sessions = clone(griffin.sessions);
    sessions[2].status = "draft";
    withRetrieved({ sessions });

    await expect(findEvents(griffinAttributes)).rejects.toThrow(
      `Session ${sessions[2].id} of series ${SERIES_ID} has status "draft"`,
    );
  });

  it("throws when a session is at a different venue", async () => {
    const sessions = clone(griffin.sessions);
    sessions[3].venue_id = "1";
    withRetrieved({ sessions });

    await expect(findEvents(griffinAttributes)).rejects.toThrow(
      `Session ${sessions[3].id} of series ${SERIES_ID} is at venue 1`,
    );
  });

  it("throws when the series' sessions were not retrieved", async () => {
    withRetrieved({ sessions: null });

    await expect(findEvents(griffinAttributes)).rejects.toThrow(
      `Expected the sessions of series ${SERIES_ID} to have been retrieved`,
    );
  });

  it("still reads the line-up of an allow-listed series", async () => {
    withRetrieved({ details: clone(griffin.details) });
    readJSON.mockImplementation(async () => ({
      movieListPages: [
        { search_data: { events: { results: [griffin.event] } } },
      ],
      moviePages: { [griffin.event.url]: griffin.details },
      organizerEvents: [],
      seriesEvents: { 2002714960358: griffin.sessions },
    }));

    const output = await findEvents(griffinAttributes);

    expect(output.map(({ title }) => title)).toEqual([
      "The Craft",
      "Scream",
      "The Blair Witch Project",
      "Halloween",
      "Hocus Pocus",
    ]);
  });
});
