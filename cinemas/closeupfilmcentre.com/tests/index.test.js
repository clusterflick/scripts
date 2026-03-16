const {
  schemaValidate,
  setupCacheMock,
} = require("../../../common/test-utils");
const {
  sortAndFilterMovies,
  removeMatchingHints,
  addTestCategory,
} = require("../../../common/utils");
const { retrieve, transform, attributes } = require("..");

jest.mock("../../../common/cache");
setupCacheMock(__dirname, "2026-03-16");

describe(attributes.name, () => {
  jest.useFakeTimers().setSystemTime(new Date("2026-03-16"));

  it("retrieve and transform", async () => {
    const { movieListPage, moviePages } = await retrieve();

    // Make sure the input looks roughly correct
    expect(movieListPage).toBeTruthy();
    expect(moviePages).toBeTruthy();
    expect(Object.keys(moviePages)).toHaveLength(23);

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
    expect(data).toHaveLength(23);

    expect(schemaValidate(data)).toBe(true);
    expect(data).toMatchSnapshot();
  });
});
