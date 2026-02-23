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

jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  readJSON: jest.fn(),
}));

const isRecording = false;

jest.mock("../../../common/cache");
setupCacheMock(__dirname, "2026-02-23");

// Hide script output
console.log = () => {};

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-02-23"));

  describe.each([
    {
      name: "BFI Southbank",
      alternativeNames: [],
      geo: { lat: 51.50661723132389, lon: -0.11579438330226112 },
      expectedMatches: 72,
    },
    {
      name: "Curzon Mayfair",
      alternativeNames: [],
      geo: { lat: 51.506734218879856, lon: -0.14792424440091292 },
      expectedMatches: 0,
    },
  ])("$name", ({ name, alternativeNames, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { movieListPages, moviePages } = await retrieve();

        // Make sure the input looks roughly correct
        expect(movieListPages).toBeTruthy();
        expect(moviePages).toBeTruthy();
        expect(Object.keys(moviePages)).toHaveLength(72);

        readJSON.mockImplementation(() => ({ movieListPages, moviePages }));

        const cinema = { name, alternativeNames, geo };
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
