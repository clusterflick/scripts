/** @jest-environment setup-polly-jest/jest-environment-node */
const { setupPolly, schemaValidate } = require("../../../common/test-utils");
const { sortAndFilterMovies } = require("../../../common/utils");
const { retrieve, transform, attributes } = require("..");

const isRecording = false;

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2025-02-25"));

  it(
    "retrieve and transform",
    async () => {
      const { moviePages } = await retrieve();

      // Make sure the input looks roughly correct
      expect(moviePages).toBeTruthy();
      expect(moviePages).toHaveLength(62);

      const output = sortAndFilterMovies(await transform({ moviePages }, {}));
      const data = JSON.parse(JSON.stringify(output));

      // Make sure the data looks roughly correct
      expect(data).toHaveLength(62);

      expect(schemaValidate(data)).toBe(true);
      expect(data).toMatchSnapshot();
    },
    isRecording ? 120_000 : undefined,
  );
});
