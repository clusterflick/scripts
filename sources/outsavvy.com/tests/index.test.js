/** @jest-environment setup-polly-jest/jest-environment-node */
const {
  setupPolly,
  schemaValidate,
  silenceConsoleLog,
} = require("../../../common/test-utils");
const {
  readJSON,
  removeMatchingHints,
  addTestCategory,
} = require("../../../common/utils");
const { attributes, retrieve, findEvents } = require("..");

const isRecording = false;

jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  readJSON: jest.fn(),
}));

silenceConsoleLog();

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-11-04"));

  describe.each([
    // The Divine's Big Brother final screening is tagged screening and never
    // film, so it is what holds the second hashtag sweep in place.
    {
      cinema: require("../../../cinemas/thedivine.co.uk/attributes"),
      expectedMatches: 4,
    },
    // Spectra's Annette Kennerley screening is in no hashtag listing, and only
    // reaches us through the organiser's own page.
    {
      cinema: require("../../../cinemas/ucl.ac.uk-ucl-east-community-cinema/attributes"),
      expectedMatches: 1,
    },
  ])("$cinema.name", ({ cinema, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { movieListPages, organiserPages, moviePages } = await retrieve();

        // Make sure the input looks roughly correct
        expect(movieListPages).toHaveLength(2);
        expect(organiserPages).toHaveLength(1);
        expect(moviePages).toBeTruthy();
        expect(Object.keys(moviePages)).toHaveLength(26);

        readJSON.mockImplementation(() => ({
          movieListPages,
          organiserPages,
          moviePages,
        }));

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
