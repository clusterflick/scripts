/** @jest-environment setup-polly-jest/jest-environment-node */
const { setupPolly, schemaValidate } = require("../../../common/test-utils");
const { sortAndFilterMovies } = require("../../../common/utils");
const { retrieve, transform, attributes } = require("..");

const isRecording = false;

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2025-01-23"));

  it(
    "retrieve and transform",
    async () => {
      const { movieListPage, moviePages } = await retrieve();

      // Make sure the input looks roughly correct
      expect(movieListPage).toBeTruthy();
      expect(moviePages).toBeTruthy();
      expect(Object.keys(moviePages)).toHaveLength(48);

      const output = sortAndFilterMovies(
        await transform({ movieListPage, moviePages }, {}),
      );
      const data = JSON.parse(JSON.stringify(output));

      // Make sure the data looks roughly correct
      expect(data).toHaveLength(48);

      expect(schemaValidate(data)).toBe(true);
      expect(data).toMatchSnapshot();
    },
    isRecording ? 120_000 : undefined,
  );
});
