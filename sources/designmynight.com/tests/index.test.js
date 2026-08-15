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
  jest.useFakeTimers().setSystemTime(new Date("2026-08-15"));

  describe.each([
    // Tagged "Pop-Up Cinema" rather than "Film Screenings", so this venue is
    // only found because retrieve searches both tags
    {
      name: "Rivoli Ballroom",
      geo: { lat: 51.4552064642324, lon: -0.0371281587298912 },
      expectedMatches: 1,
    },
    // Listed as "The Soho Hotel", so it is only found via its alternative name
    {
      name: "Firmdale The Soho Hotel",
      alternativeNames: ["Soho Hotel"],
      geo: { lat: 51.51415539168877, lon: -0.13367249962787486 },
      expectedMatches: 1,
    },
    // Every screening this venue lists is cancelled at source, so the
    // availability API returns no occurrences for any of them
    {
      name: "The Fellowship Cinema",
      alternativeNames: ["The Fellowship Inn", "The Fellowship Inn Cinema"],
      geo: { lat: 51.433108588491734, lon: -0.019912945972504828 },
      expectedMatches: 0,
    },
  ])("$name", ({ name, alternativeNames, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { movieListPages, moviePages } = await retrieve();

        // Make sure the input looks roughly correct
        expect(movieListPages).toBeTruthy();
        expect(Object.keys(movieListPages)).toHaveLength(51);
        expect(moviePages).toBeTruthy();
        expect(Object.keys(moviePages)).toHaveLength(2);

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
