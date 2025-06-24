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
  jest.useFakeTimers().setSystemTime(new Date("2025-06-24"));

  it(
    "retrieve and transform",
    async () => {
      const moviePages = await retrieve();

      // Make sure the input looks roughly correct
      expect(moviePages).toBeTruthy();
      expect(moviePages).toHaveLength(22);

      const output = sortAndFilterMovies(await transform(moviePages, {}));
      expect(
        output.every((movie) =>
          Object.prototype.hasOwnProperty.call(movie, "matchingHints"),
        ),
      ).toBe(true);

      const data = JSON.parse(JSON.stringify(output))
        .map(removeMatchingHints)
        .map(addTestCategory);

      // Make sure the data looks roughly correct
      expect(data).toHaveLength(20); // This count is not related to the above

      expect(schemaValidate(data)).toBe(true);
      expect(data).toMatchSnapshot();
    },
    isRecording ? 120_000 : undefined,
  );
});
