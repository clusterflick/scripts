/** @jest-environment setup-polly-jest/jest-environment-node */
const {
  setupPolly,
  schemaValidate,
  disableCache,
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

// Make dailyCache a passthrough so every request still replays through Polly
// (rather than reading/writing real cache files on disk during the test).
jest.mock("../../../common/cache");
disableCache();

// Hide script output
console.log = () => {};

const cinema = {
  name: "Genesis Cinema",
  geo: { lat: 51.52128726645794, lon: -0.051143457671891594 },
};

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2025-11-13"));

  it(
    "retrieve and find events",
    async () => {
      // retrieve() throttles between page fetches with sleep(). Under fake
      // timers those setTimeouts never fire on their own, so drive them with
      // runAllTimersAsync (which also flushes the fetch promises in between)
      // while retrieve runs, rather than waiting out the real delays.
      const retrievePromise = retrieve();
      await jest.runAllTimersAsync();
      const { movieListPages, moviePages } = await retrievePromise;

      // Make sure the input looks roughly correct
      expect(movieListPages).toBeTruthy();
      expect(movieListPages).toHaveLength(60);
      expect(moviePages).toBeTruthy();
      expect(Object.keys(moviePages)).toHaveLength(929);

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
      expect(data).toHaveLength(5);
      expect(data).toMatchSnapshot();
    },
    // Replaying ~1000 cached page fetches (each driven by runAllTimersAsync +
    // a Polly HAR replay) is compute-heavy and overruns the default 5s timeout
    // under full-suite parallelism, so give it generous headroom.
    isRecording ? 3_600_000 : 30_000,
  );
});
