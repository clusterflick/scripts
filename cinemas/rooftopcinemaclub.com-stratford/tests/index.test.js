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
  jest.useFakeTimers().setSystemTime(new Date("2026-08-11"));

  it(
    "retrieve and transform",
    async () => {
      const { screeningPages, soldOutDetails, filmPages } = await retrieve();

      expect(screeningPages).toHaveLength(4);
      expect(Object.keys(soldOutDetails)).toHaveLength(2);
      expect(Object.keys(filmPages)).toHaveLength(50);

      const output = sortAndFilterMovies(
        await transform({ screeningPages, soldOutDetails, filmPages }, {}),
      );
      expect(
        output.every((movie) =>
          Object.prototype.hasOwnProperty.call(movie, "matchingHints"),
        ),
      ).toBe(true);

      const data = JSON.parse(JSON.stringify(output))
        .map(removeMatchingHints)
        .map(addTestCategory);

      expect(data).toHaveLength(50);

      expect(schemaValidate(data)).toBe(true);
      expect(data).toMatchSnapshot();
    },
    isRecording ? 240_000 : undefined,
  );
});
