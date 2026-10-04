/** @jest-environment setup-polly-jest/jest-environment-node */
const { setupPolly, schemaValidate } = require("../../../common/test-utils");
const {
  readJSON,
  sleep,
  removeMatchingHints,
  addTestCategory,
} = require("../../../common/utils");
const { attributes, retrieve, findEvents } = require("..");
const {
  attributes: canadaWaterLibraryAttributes,
} = require("../../../cinemas/southwark.gov.uk-canada-water-library");

jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  readJSON: jest.fn(),
  sleep: jest.fn(),
}));

const isRecording = false;

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  // Retrieve paces its requests, which matters only against the live site, so
  // a replay doesn't wait. Timeouts stay real for the recording's sake, or the
  // pacing and fetch retries would wait on a clock that never moves.
  if (isRecording) {
    sleep.mockImplementation(jest.requireActual("../../../common/utils").sleep);
  }
  jest
    .useFakeTimers({ doNotFake: ["setTimeout"] })
    .setSystemTime(new Date("2026-10-04"));

  describe.each([
    {
      // The event's address carries no venue name, only the street address,
      // which is recognised from the first line of the cinema's address
      ...canadaWaterLibraryAttributes,
      expectedMatches: 1,
    },
    {
      // Named in the event's address. Southwark doesn't geocode its locations,
      // so the match is confirmed by postcode.
      name: "Nunhead Library",
      alternativeNames: [],
      address: "Gordon Road, London, SE15 3RW, UK",
      expectedMatches: 1,
    },
  ])("$name", ({ name, alternativeNames, address, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { movieListPages, moviePages } = await retrieve();

        // Make sure the input looks roughly correct
        expect(movieListPages).toHaveLength(3);
        expect(Object.keys(moviePages)).toHaveLength(7);

        readJSON.mockImplementation(() => ({ movieListPages, moviePages }));

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
      },
      isRecording ? 600_000 : undefined,
    );
  });

  it(
    "returns no events for unrelated cinema",
    async () => {
      const { movieListPages, moviePages } = await retrieve();

      readJSON.mockImplementation(() => ({ movieListPages, moviePages }));

      const unrelatedCinema = {
        name: "Some Other Cinema",
        alternativeNames: [],
        address: "1 Some Road, London, N1 1AA, UK",
        geo: { lat: 51.5387, lon: -0.0999 },
      };
      expect(await findEvents(unrelatedCinema)).toHaveLength(0);

      // Without coordinates the postcode is all that confirms a name match, so a
      // same-named venue elsewhere must not pick up Nunhead Library's events
      const distantNunheadLibrary = {
        name: "Nunhead Library",
        alternativeNames: [],
        address: "1 Some Road, London, N1 1AA, UK",
        geo: { lat: 51.5387, lon: -0.0999 },
      };
      expect(await findEvents(distantNunheadLibrary)).toHaveLength(0);
    },
    isRecording ? 600_000 : undefined,
  );
});
