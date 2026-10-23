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

// The site answers a plain fetch with its bot check, so the pages are captured
// from a Camoufox retrieve through the daily cache rather than recorded by
// Polly, which only sees `fetch`.
jest.mock("../../../common/cache");
setupCacheMock(__dirname, "2026-10-23");

describe(attributes.name, () => {
  jest.useFakeTimers().setSystemTime(new Date("2026-10-23"));

  it("retrieve and transform", async () => {
    const { movieListPage, eventPages } = await retrieve();

    // Make sure the input looks roughly correct
    expect(movieListPage).toBeTruthy();
    expect(eventPages).toBeTruthy();
    expect(Object.keys(eventPages)).toHaveLength(10);

    const output = sortAndFilterMovies(
      await transform({ movieListPage, eventPages }, {}),
    );
    expect(
      output.every((movie) =>
        Object.prototype.hasOwnProperty.call(movie, "matchingHints"),
      ),
    ).toBe(true);

    // The hint is the event page's full description, which names the plot the
    // listing card's excerpt stops short of
    const allThatGlitters = output.find(({ title }) =>
      title.startsWith("All that Glitters"),
    );
    expect(allThatGlitters.matchingHints.overview).toContain(
      "ghost of William Shakespeare",
    );

    const data = JSON.parse(JSON.stringify(output))
      .map(removeMatchingHints)
      .map(addTestCategory);

    // Make sure the data looks roughly correct
    expect(data).toHaveLength(9);

    expect(schemaValidate(data)).toBe(true);
    expect(data).toMatchSnapshot();
  });
});
