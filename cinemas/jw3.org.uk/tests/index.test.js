/** @jest-environment setup-polly-jest/jest-environment-node */
const {
  setupPolly,
  schemaValidate,
  disableCache,
} = require("../../../common/test-utils");
const {
  sortAndFilterMovies,
  removeMatchingHints,
  addTestCategory,
  sleep,
} = require("../../../common/utils");
const { retrieve, transform, attributes } = require("..");

jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  sleep: jest.fn(),
}));

// Passthrough the daily cache so every page is served by the recordings below,
// rather than read from or written to cache files on disk.
jest.mock("../../../common/cache");
disableCache();

const isRecording = false;

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  // Retrieve paces its requests, which matters only against the live site, so
  // a replay doesn't wait. A recording needs the real pause, and with it a real
  // clock.
  if (isRecording) {
    sleep.mockImplementation(jest.requireActual("../../../common/utils").sleep);
  }
  jest.useFakeTimers().setSystemTime(new Date("2026-09-29"));

  it(
    "retrieve and transform",
    async () => {
      const { movieListPages, moviePages } = await retrieve();

      // Make sure the input looks roughly correct
      expect(movieListPages).toBeTruthy();
      expect(movieListPages).toHaveLength(1);
      expect(moviePages).toBeTruthy();
      expect(Object.keys(moviePages)).toHaveLength(17);

      const output = sortAndFilterMovies(
        await transform({ movieListPages, moviePages }, {}),
      );
      expect(
        output.every((movie) =>
          Object.prototype.hasOwnProperty.call(movie, "matchingHints"),
        ),
      ).toBe(true);

      const data = JSON.parse(JSON.stringify(output))
        .map(removeMatchingHints)
        .map(addTestCategory);

      // Make sure the data looks roughly correct
      expect(data).toHaveLength(17);

      expect(schemaValidate(data)).toBe(true);
      expect(data).toMatchSnapshot();
    },
    isRecording ? 240_000 : undefined,
  );
});
