/** @jest-environment setup-polly-jest/jest-environment-node */
const { setupPolly, schemaValidate } = require("../../../common/test-utils");
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

// Hide script output
console.log = () => {};

// The Vagina Museum reaches us through the "screening" hashtag rather than
// "film" - its events are never tagged film - so matching against it is what
// holds the second listing sweep in place.
const cinema = {
  name: "Vagina Museum",
  geo: { lat: 51.53040329879552, lon: -0.05685235988623171 },
};

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2025-10-28"));

  it(
    "retrieve and find events",
    async () => {
      const { movieListPages, moviePages } = await retrieve();

      // Make sure the input looks roughly correct
      expect(movieListPages).toHaveLength(2);
      expect(moviePages).toBeTruthy();
      expect(Object.keys(moviePages)).toHaveLength(30);

      readJSON.mockImplementation(() => ({ movieListPages, moviePages }));

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
      expect(data).toHaveLength(1);
      expect(data).toMatchSnapshot();
    },
    isRecording ? 600_000 : undefined,
  );
});
