/** @jest-environment setup-polly-jest/jest-environment-node */
const {
  setupPolly,
  setupCacheMock,
  schemaValidate,
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
setupCacheMock(__dirname, "2026-04-17");

describe(`${attributes.name}`, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-04-17T19:00"));

  describe.each([
    {
      name: "Everyman Chelsea",
      geo: { lat: 51.48545760933609, lon: -0.17337379614330337 },
      expectedMatches: 0,
    },
    {
      name: "Close-Up Film Centre",
      alternativeNames: ["Close-Up Cinema"],
      geo: { lat: 51.52363533860424, lon: -0.07204024586584808 },
      expectedMatches: 18,
    },
    {
      name: "The Exchange Twickenham",
      alternativeNames: ["The Exchange"],
      geo: { lat: 51.45004001959767, lon: -0.3313163212241062 },
      expectedMatches: 10,
    },
  ])("$name", ({ name, alternativeNames, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { movieListPages, moviePages } = await retrieve();

        // Make sure the input looks roughly correct
        expect(movieListPages).toBeTruthy();
        // Each request returns only one page of up to 100 results
        expect(movieListPages).toHaveLength(4);

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
