const { readJSON } = require("../../../common/utils");
const findEvents = require("../find-events");
const griffinAttributes = require("../../../cinemas/griffinwhetstone.pub/attributes");
const griffin = require("./fixtures/griffin-halloween.json");

jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  readJSON: jest.fn(),
}));

const clone = (value) => JSON.parse(JSON.stringify(value));

// The Griffin's event, read as a single event rather than a series
const singleEventDetails = () => {
  const details = clone(griffin.details);
  details.props.pageProps.context.basicInfo.isSeries = false;
  return details;
};

const withRetrieved = ({ moviePages, removedEvents }) =>
  readJSON.mockImplementation(async () => ({
    movieListPages: [{ search_data: { events: { results: [griffin.event] } } }],
    moviePages,
    organizerEvents: [],
    seriesEvents: {},
    ...(removedEvents ? { removedEvents } : {}),
  }));

describe("eventbrite event pages", () => {
  it("publishes an event with its page", async () => {
    withRetrieved({
      moviePages: { [griffin.event.url]: singleEventDetails() },
      removedEvents: [],
    });

    expect(await findEvents(griffinAttributes)).toHaveLength(1);
  });

  // The search index lists some events for weeks after their organiser
  // removed them
  it("drops an event the retrieve found removed", async () => {
    withRetrieved({ moviePages: {}, removedEvents: [griffin.event.url] });

    expect(await findEvents(griffinAttributes)).toEqual([]);
  });

  // Published without its page, it went out with no description, no sale
  // status and no series
  it("throws on any other event without a page", async () => {
    withRetrieved({ moviePages: {}, removedEvents: [] });

    await expect(findEvents(griffinAttributes)).rejects.toThrow(
      `No event page retrieved for ${griffin.event.url} - the retrieved data is incomplete`,
    );
  });

  // Releases from before removed events were named can't tell the two apart
  it("drops an event without a page from a release that names none", async () => {
    withRetrieved({ moviePages: {} });

    expect(await findEvents(griffinAttributes)).toEqual([]);
  });
});
