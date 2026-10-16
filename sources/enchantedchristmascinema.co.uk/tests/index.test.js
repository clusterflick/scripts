/** @jest-environment setup-polly-jest/jest-environment-node */
const { setupPolly, schemaValidate } = require("../../../common/test-utils");
const {
  readJSON,
  removeMatchingHints,
  addTestCategory,
} = require("../../../common/utils");
const { attributes, retrieve, findEvents } = require("..");

jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  readJSON: jest.fn(),
}));

const isRecording = false;

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-10-16"));

  describe.each([
    {
      name: "Plaza Camden",
      alternativeNames: ["The Plaza"],
      address: "14 Parkway, London, NW1 7AA, UK",
      geo: { lat: 51.53884451152027, lon: -0.1435284534180323 },
      expectedMatches: 8,
    },
    {
      // Same name, wrong place - the postcode keeps it apart
      name: "Somewhere Else",
      alternativeNames: ["The Plaza"],
      address: "1 High Street, London, E1 6AN, UK",
      geo: { lat: 51.5194, lon: -0.0727 },
      expectedMatches: 0,
    },
    {
      name: "Some Other Cinema",
      alternativeNames: [],
      address: "14 Parkway, London, NW1 7AA, UK",
      geo: { lat: 51.53884451152027, lon: -0.1435284534180323 },
      expectedMatches: 0,
    },
  ])("$name", ({ name, alternativeNames, address, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { venuePages } = await retrieve();

        // Make sure the input looks roughly correct
        expect(Object.keys(venuePages)).toHaveLength(3);

        readJSON.mockImplementation(() => ({ venuePages }));

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
});
