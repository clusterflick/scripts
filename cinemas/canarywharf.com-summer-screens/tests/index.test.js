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
setupCacheMock(__dirname, "2026-07-11");

describe(attributes.name, () => {
  jest.useFakeTimers().setSystemTime(new Date("2026-07-11"));

  it("retrieve and transform", async () => {
    const { movieListPage } = await retrieve();

    expect(movieListPage).toBeTruthy();

    const output = sortAndFilterMovies(await transform({ movieListPage }, {}));
    expect(
      output.every((movie) =>
        Object.prototype.hasOwnProperty.call(movie, "matchingHints"),
      ),
    ).toBe(true);

    const data = JSON.parse(JSON.stringify(output))
      .map(removeMatchingHints)
      .map(addTestCategory);

    expect(data).toHaveLength(12);

    expect(schemaValidate(data)).toBe(true);
    expect(data).toMatchSnapshot();
  });
});
