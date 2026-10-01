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
  jest.useFakeTimers().setSystemTime(new Date("2026-10-01"));

  it(
    "retrieve and transform",
    async () => {
      const { events } = await retrieve();

      // Make sure the input looks roughly correct
      expect(events).toHaveLength(8);

      const output = sortAndFilterMovies(await transform({ events }, {}));
      expect(
        output.every((movie) =>
          Object.prototype.hasOwnProperty.call(movie, "matchingHints"),
        ),
      ).toBe(true);

      // The yard sales are dropped as not film, and the last film night is
      // dropped until its film is named.
      expect(output.map(({ title }) => title)).toEqual([
        "National Theatre Live - The Misanthrope",
        "Saturday Film Nights - Jurassic Park",
        "Saturday Film Nights - Paddington 2",
        "Saturday Film Nights - Spirited Away",
        "Saturday Film Nights - The Terminator",
      ]);

      const data = JSON.parse(JSON.stringify(output))
        .map(removeMatchingHints)
        .map(addTestCategory);

      // Make sure the data looks roughly correct
      expect(data).toHaveLength(5);

      expect(schemaValidate(data)).toBe(true);
      expect(data).toMatchSnapshot();
    },
    isRecording ? 240_000 : undefined,
  );
});
