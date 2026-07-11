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
  jest.useFakeTimers().setSystemTime(new Date("2026-07-11"));

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

      expect(data).toHaveLength(107);

      expect(schemaValidate(data)).toBe(true);
      expect(data).toMatchSnapshot();
    },
    isRecording ? 240_000 : undefined,
  );
});
