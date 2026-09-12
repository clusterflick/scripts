/** @jest-environment setup-polly-jest/jest-environment-node */
const { setupPolly, schemaValidate } = require("../../../common/test-utils");
const {
  sortAndFilterMovies,
  removeMatchingHints,
  addTestCategory,
} = require("../../../common/utils");
const { retrieve, transform, attributes } = require("..");

const isRecording = false;

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  // Pinned to the start of the year the poster covers, so the snapshot holds
  // every Sunday of it rather than only the ones still to come.
  jest.useFakeTimers().setSystemTime(new Date("2026-01-01"));

  it(
    "retrieve and transform",
    async () => {
      const { csvText } = await retrieve();

      expect(csvText).toBeTruthy();

      const output = sortAndFilterMovies(await transform({ csvText }, {}));
      expect(
        output.every((movie) =>
          Object.prototype.hasOwnProperty.call(movie, "matchingHints"),
        ),
      ).toBe(true);

      const data = JSON.parse(JSON.stringify(output))
        .map(removeMatchingHints)
        .map(addTestCategory);

      // One film every Sunday of 2026, none of them repeated.
      expect(data).toHaveLength(52);

      expect(schemaValidate(data)).toBe(true);
      expect(data).toMatchSnapshot();
    },
    isRecording ? 240_000 : undefined,
  );
});
