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

// Hide script output
console.log = () => {};

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-08-17"));

  describe.each([
    {
      name: "Pelican House",
      address: "144 Cambridge Heath Road, Bethnal Green, London, E1 5QJ, UK",
      geo: { lat: 51.5241916812964, lon: -0.054707535680199156 },
      expectedMatches: 1,
    },
    {
      name: "Close-Up Film Centre",
      alternativeNames: ["Close-Up Cinema"],
      address: "97 Sclater Street, London, E1 6HR, UK",
      geo: { lat: 51.52363533860424, lon: -0.07204024586584808 },
      expectedMatches: 0,
    },
  ])("$name", ({ name, alternativeNames, address, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { movieListPages, moviePages } = await retrieve();

        // Make sure the input looks roughly correct
        expect(movieListPages).toBeTruthy();
        expect(moviePages).toBeTruthy();
        // One results page for each of the two genres searched
        expect(movieListPages).toHaveLength(2);
        expect(Object.keys(moviePages)).toHaveLength(1);

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
});
