/** @jest-environment setup-polly-jest/jest-environment-node */
const {
  setupPolly,
  setupCacheMock,
  schemaValidate,
} = require("../../../common/test-utils");
const { sortAndFilterMovies } = require("../../../common/utils");
const { retrieve, transform, attributes } = require("..");

const isRecording = false;

jest.mock("../../../common/cache");
setupCacheMock(__dirname, "2025-01-24");

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2025-01-24"));

  it(
    "retrieve and transform",
    async () => {
      const moviePages = await retrieve();

      // Make sure the input looks roughly correct
      expect(moviePages).toBeTruthy();
      expect(moviePages.result.length).toBe(42);

      const output = sortAndFilterMovies(await transform(moviePages, {}));
      const data = JSON.parse(JSON.stringify(output));

      // Make sure the data looks roughly correct
      expect(data.length).toBe(42);

      expect(schemaValidate(data)).toBe(true);
      expect(data).toMatchSnapshot();
    },
    isRecording ? 120_000 : undefined,
  );
});
