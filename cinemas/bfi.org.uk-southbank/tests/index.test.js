/** @jest-environment setup-polly-jest/jest-environment-node */
const {
  setupPolly,
  schemaValidate,
  setupCacheMock,
} = require("../../../common/test-utils");
const {
  sortAndFilterMovies,
  removeMatchingHints,
  addTestCategory,
} = require("../../../common/utils");
const { retrieve, transform, attributes } = require("..");

const isRecording = false;

jest.mock("../../../common/cache");
setupCacheMock(__dirname, "2026-07-19");

// Hide script output
console.log = () => {};

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-07-19"));

  it(
    "retrieve and transform",
    async () => {
      const { filmsIndexPage, moviePages } = await retrieve();

      // Make sure the input looks roughly correct
      expect(filmsIndexPage).toBeTruthy();
      expect(moviePages).toBeTruthy();
      expect(Object.keys(moviePages)).toHaveLength(250);

      const output = sortAndFilterMovies(await transform({ moviePages }, {}));
      expect(
        output.every((movie) =>
          Object.prototype.hasOwnProperty.call(movie, "matchingHints"),
        ),
      ).toBe(true);

      const data = JSON.parse(JSON.stringify(output))
        .map(removeMatchingHints)
        .map(addTestCategory);

      // Make sure the data looks roughly correct
      expect(data).toHaveLength(164);

      expect(schemaValidate(data)).toBe(true);
      expect(data).toMatchSnapshot();
    },
    isRecording ? 240_000 : 10_000,
  );
});
