/** @jest-environment setup-polly-jest/jest-environment-node */
const {
  setupPolly,
  schemaValidate,
  setupCacheMock,
} = require("../../../common/test-utils");
const {
  readJSON,
  removeMatchingHints,
  addTestCategory,
} = require("../../../common/utils");
const { attributes, retrieve, findEvents } = require("..");
const {
  attributes: conwayHallAttributes,
} = require("../../../cinemas/conwayhall.org.uk");
const {
  attributes: swissCottageLibraryAttributes,
} = require("../../../cinemas/camden.gov.uk-swiss-cottage-library");

jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  readJSON: jest.fn(),
}));

const isRecording = false;

// The site is only reachable through a browser, which Polly can't record. The
// pages' data replays instead from the cache files a real retrieve wrote, so a
// replay never launches the browser. Polly stays for any request that escapes
// anyway - a missing fixture should fail here, not quietly reach the site.
jest.mock("../../../common/cache");
setupCacheMock(__dirname, "2026-10-04");

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-10-04"));

  describe.each([
    {
      ...conwayHallAttributes,
      expectedMatches: 2,
    },
    {
      // Love Camden names it plainly, where the address leads with "Swiss
      // Cottage, Central Library" - matched by name and confirmed by location
      ...swissCottageLibraryAttributes,
      expectedMatches: 1,
    },
  ])("$name", ({ name, alternativeNames, address, geo, expectedMatches }) => {
    it("retrieve and find events", async () => {
      const { whatsOnData, eventData } = await retrieve();

      // Make sure the input looks roughly correct - every event the site
      // lists, and the data for each of the seven tagged as film
      expect(whatsOnData.nodes).toHaveLength(2);
      expect(Object.keys(eventData)).toHaveLength(7);

      readJSON.mockImplementation(() => ({ whatsOnData, eventData }));

      const cinema = { name, alternativeNames, address, geo };
      const output = await findEvents(cinema);
      expect(
        output.every((movie) =>
          Object.prototype.hasOwnProperty.call(movie, "matchingHints"),
        ),
      ).toBe(true);

      const data = JSON.parse(JSON.stringify(output))
        .map(removeMatchingHints)
        .map(addTestCategory);

      // Make sure the data looks roughly correct
      expect(schemaValidate(data)).toBe(true);
      expect(data).toHaveLength(expectedMatches);
      expect(data).toMatchSnapshot();
    });
  });

  it("returns no events for unrelated cinema", async () => {
    const { whatsOnData, eventData } = await retrieve();

    readJSON.mockImplementation(() => ({ whatsOnData, eventData }));

    const unrelatedCinema = {
      name: "Some Other Cinema",
      alternativeNames: [],
      address: "1 Some Road, London, SE1 1AA, UK",
      geo: { lat: 51.5, lon: -0.1 },
    };
    expect(await findEvents(unrelatedCinema)).toHaveLength(0);

    // A same-named venue elsewhere must not pick up Conway Hall's events
    const distantConwayHall = {
      name: "Conway Hall",
      alternativeNames: [],
      address: "1 Some Road, London, SE1 1AA, UK",
      geo: { lat: 51.5, lon: -0.1 },
    };
    expect(await findEvents(distantConwayHall)).toHaveLength(0);
  });

  it("fails loudly when the data's structure changes", async () => {
    const { whatsOnData, eventData } = await retrieve();
    const cinema = { name: "Conway Hall", alternativeNames: [] };

    // The events list gone from the what's on page's data
    readJSON.mockImplementation(() => ({
      whatsOnData: { ...whatsOnData, nodes: [whatsOnData.nodes[0]] },
      eventData,
    }));
    await expect(findEvents(cinema)).rejects.toThrow(
      /Unable to find the events/,
    );

    // A film event whose own data wasn't retrieved
    const [slug] = Object.keys(eventData);
    const otherEventData = { ...eventData };
    delete otherEventData[slug];
    readJSON.mockImplementation(() => ({
      whatsOnData,
      eventData: otherEventData,
    }));
    await expect(findEvents(cinema)).rejects.toThrow(/No event data retrieved/);
  });
});
