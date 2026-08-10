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
// Captured from a real TicketSource retrieve for this venue. The transform
// resolves its showing ids from these events rather than from the site's own
// booking links, and merges in performances the site's calendar doesn't list, so
// an empty set wouldn't exercise either path.
const sourcedEvents = require("./sourced-events.json");

jest.mock("../../../common/cache");
setupCacheMock(__dirname, "2026-08-10");

describe(attributes.name, () => {
  jest.useFakeTimers().setSystemTime(new Date("2026-08-10"));

  it("retrieve and transform", async () => {
    const { movieListPage, moviePages } = await retrieve();

    // Make sure the input looks roughly correct
    expect(movieListPage).toBeTruthy();
    expect(moviePages).toBeTruthy();
    expect(Object.keys(moviePages)).toHaveLength(15);

    const output = sortAndFilterMovies(
      await transform({ movieListPage, moviePages }, sourcedEvents),
    );
    expect(
      output.every((movie) =>
        Object.prototype.hasOwnProperty.call(movie, "matchingHints"),
      ),
    ).toBe(true);

    // Every film the site lists is identified by its TicketSource event, so the
    // same showing keeps one id whether it came from here or from the source
    // alone - and no film is emitted twice under the same id.
    const showingIds = output.map(({ showingId }) => showingId);
    expect(showingIds.every((id) => id.startsWith("ticketsource.co.uk-"))).toBe(
      true,
    );
    expect(new Set(showingIds).size).toBe(showingIds.length);

    const data = JSON.parse(JSON.stringify(output))
      .map(removeMatchingHints)
      .map(addTestCategory);

    // Make sure the data looks roughly correct
    expect(data).toHaveLength(15);

    expect(schemaValidate(data)).toBe(true);
    expect(data).toMatchSnapshot();
  });
});
