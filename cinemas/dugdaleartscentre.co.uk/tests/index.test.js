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
  jest.useFakeTimers().setSystemTime(new Date("2026-08-05"));

  it(
    "retrieve and transform",
    async () => {
      const { movieListPage, moviePages } = await retrieve();

      // Make sure the input looks roughly correct
      expect(movieListPage).toBeTruthy();
      expect(moviePages).toBeTruthy();
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
      expect(data).toHaveLength(2);

      expect(schemaValidate(data)).toBe(true);
      expect(data).toMatchSnapshot();
    },
    isRecording ? 240_000 : undefined,
  );

  it("transforms the venue's explicit empty state to no movies", async () => {
    const movieListPage = `
      <div class="whats-on-grid" id="whats_on_grid">
        <div class="empty">
          <h2>We don’t currently have any scheduled events that match your selection.</h2>
        </div>
      </div>`;

    expect(await transform({ movieListPage, moviePages: {} }, {})).toEqual([]);
  });

  it("throws when no movies are found without the empty state", async () => {
    const movieListPage = `<div class="whats-on-grid" id="whats_on_grid"></div>`;

    await expect(
      transform({ movieListPage, moviePages: {} }, {}),
    ).rejects.toThrow("No movies found - the page structure may have changed");
  });
});
