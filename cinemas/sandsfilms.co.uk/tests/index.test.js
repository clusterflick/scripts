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
      const retrieved = await retrieve();

      // Make sure the input looks roughly correct
      expect(retrieved).toBeTruthy();

      const output = sortAndFilterMovies(await transform(retrieved, {}));
      expect(
        output.every((movie) =>
          Object.prototype.hasOwnProperty.call(movie, "matchingHints"),
        ),
      ).toBe(true);

      const data = JSON.parse(JSON.stringify(output))
        .map(removeMatchingHints)
        .map(addTestCategory);

      // Make sure the data looks roughly correct
      expect(data).toHaveLength(3);

      expect(schemaValidate(data)).toBe(true);
      expect(data).toMatchSnapshot();

      // Undated events (merchandise sold through Eventive) have no start time
      // and are dropped rather than failing the transform
      const [event] = retrieved.movieListPage.events.filter(
        ({ is_virtual }) => !is_virtual,
      );
      // eslint-disable-next-line no-unused-vars
      const { start_time, end_time, ...undatedEvent } = event;
      const withUndated = {
        movieListPage: {
          ...retrieved.movieListPage,
          events: [
            ...retrieved.movieListPage.events,
            { ...undatedEvent, id: "undated-event", is_dated: false },
          ],
        },
      };
      expect(sortAndFilterMovies(await transform(withUndated, {}))).toEqual(
        output,
      );
    },
    isRecording ? 240_000 : undefined,
  );
});
