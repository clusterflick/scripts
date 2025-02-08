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
      const moviePages = await retrieve();

      // Make sure the input looks roughly correct
      expect(moviePages).toBeTruthy();
      expect(Object.keys(moviePages.filmData.films)).toHaveLength(7);

      const output = sortAndFilterMovies(await transform(moviePages, {}));
      const data = JSON.parse(JSON.stringify(output));

      // Make sure the data looks roughly correct
      expect(data).toHaveLength(6); // One of the entries has no performances

      expect(schemaValidate(data)).toBe(true);
      expect(data).toMatchSnapshot();
    },
    isRecording ? 120_000 : undefined,
  );
});
