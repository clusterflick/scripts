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

describe(`${attributes.name}`, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2025-10-30"));

  describe.each([
    {
      name: "Art'otel London Hoxton",
      geo: { lat: 51.52617208235077, lon: -0.08333904348646137 },
      expectedMatches: 11,
    },
    {
      name: "The Heathcote And Star",
      geo: { lat: 51.56601799398466, lon: 0.0021807985196629935 },
      expectedMatches: 1,
    },
    {
      name: "Rivoli Ballroom",
      geo: { lat: 51.45534799455751, lon: -0.03712389962985756 },
      expectedMatches: 7,
    },
    {
      name: "JOIA",
      geo: { lat: 51.48079445146031, lon: -0.14519212515961233 },
      expectedMatches: 9,
    },
  ])("$name", ({ name, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { movieListPages, moviePages } = await retrieve();

        // Make sure the input looks roughly correct
        expect(movieListPages).toBeTruthy();
        expect(Object.keys(movieListPages)).toHaveLength(83);
        expect(moviePages).toBeTruthy();
        expect(Object.keys(moviePages)).toHaveLength(29);

        readJSON.mockImplementation(() => ({ movieListPages, moviePages }));

        const cinema = { name, geo };
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
