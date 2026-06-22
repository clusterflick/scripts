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
  jest.useFakeTimers().setSystemTime(new Date("2026-06-11"));

  it(
    "retrieve and transform",
    async () => {
      const { movieListPage, moviePages } = await retrieve();

      expect(movieListPage).toBeTruthy();
      expect(Object.keys(moviePages)).toHaveLength(7);

      const output = sortAndFilterMovies(
        await transform({ movieListPage, moviePages }, {}),
      );
      expect(
        output.every((movie) =>
          Object.prototype.hasOwnProperty.call(movie, "matchingHints"),
        ),
      ).toBe(true);

      const data = JSON.parse(JSON.stringify(output))
        .map(removeMatchingHints)
        .map(addTestCategory);

      expect(data).toHaveLength(7);

      expect(schemaValidate(data)).toBe(true);
      expect(data).toMatchSnapshot();
    },
    isRecording ? 240_000 : undefined,
  );

  it(
    "retrieve and transform when out of season",
    async () => {
      const { movieListPage, moviePages } = await retrieve();

      expect(movieListPage).toBeTruthy();
      expect(Object.keys(moviePages)).toHaveLength(0);

      const output = sortAndFilterMovies(
        await transform({ movieListPage, moviePages }, {}),
      );

      expect(output).toEqual([]);
    },
    isRecording ? 240_000 : undefined,
  );
});
