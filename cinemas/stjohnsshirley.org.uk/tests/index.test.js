/** @jest-environment setup-polly-jest/jest-environment-node */
const { setupPolly, schemaValidate } = require("../../../common/test-utils");
const {
  sortAndFilterMovies,
  removeMatchingHints,
  addTestCategory,
} = require("../../../common/utils");
const { retrieve, transform, attributes } = require("..");
const { parseShowings } = require("../utils");

const isRecording = false;

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-11-17"));

  it(
    "retrieve and transform",
    async () => {
      const { movieListPage, moviePages } = await retrieve();

      // Make sure the input looks roughly correct: every row bar the cancelled
      // one, and a page for each film still to come
      expect(parseShowings(movieListPage)).toHaveLength(12);
      expect(Object.keys(moviePages)).toHaveLength(2);

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

      // Make sure the data looks roughly correct
      expect(data.map(({ title }) => title).sort()).toEqual([
        "Family Film – The Polar Express",
        "Love Actually",
      ]);
      // Every showing is subtitled, which each film's page says
      expect(
        data.every(({ performances }) =>
          performances.every(({ accessibility }) => accessibility.subtitled),
        ),
      ).toBe(true);

      expect(schemaValidate(data)).toBe(true);
      expect(data).toMatchSnapshot();
    },
    isRecording ? 240_000 : undefined,
  );

  it("fails when a row has no readable date", () => {
    expect(() =>
      parseShowings(
        '<h2>Cinema show times</h2><figure class="wp-block-table"><table><thead><tr><th>Date</th><th>Film</th><th>Time</th></tr></thead><tbody><tr><td>Postponed</td><td>Elf</td><td>3:30pm</td></tr></tbody></table></figure>',
      ),
    ).toThrow("no readable date");
  });
});
