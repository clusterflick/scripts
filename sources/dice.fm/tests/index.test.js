/** @jest-environment setup-polly-jest/jest-environment-node */
const { setupPolly } = require("../../../common/test-utils");
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

const cinema = {
  name: "The Clapham Grand",
  geo: { lat: 51.463318751977546, lon: -0.16939900181385437 },
};

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-01-09"));

  it(
    "retrieve and find events",
    async () => {
      const { movieListPages, moviePages } = await retrieve();

      // Make sure the input looks roughly correct
      expect(movieListPages).toBeTruthy();
      expect(moviePages).toBeTruthy();
      expect(Object.keys(moviePages)).toHaveLength(23);

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
      expect(data).toHaveLength(3);
      expect(data).toMatchSnapshot();
    },
    isRecording ? 600_000 : undefined,
  );
});
