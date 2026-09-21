// What reaches the categoriser is the point of interest, so it is stubbed -
// the categoriser's own tie-break is covered in common/tests/categorise.test.js.
// Prefixed `mock` so jest's hoisting lets the factory below close over it.
const mockCategorise = jest.fn();

jest.mock("../../../common/categorise", () =>
  Object.assign((...args) => mockCategorise(...args), {}),
);

const categoriseEntries = require("../categorise-entries");
const { previousCategoriesFrom } = categoriseEntries;

describe("previousCategoriesFrom", () => {
  test("carries the category of a listing the categoriser decided", () => {
    const yesterday = [{ showingId: "a", category: "multiple-movies" }];
    expect(previousCategoriesFrom(yesterday).get("a")).toBe("multiple-movies");
  });

  test("carries a programme's category - themoviedbs does not make it matched", () => {
    const yesterday = [
      { showingId: "a", category: "shorts", themoviedbs: [{ id: 1 }] },
    ];
    expect(previousCategoriesFrom(yesterday).get("a")).toBe("shorts");
  });

  test("leaves out a listing matched to a film, whose 'movie' came from the match", () => {
    const yesterday = [
      { showingId: "a", category: "movie", themoviedb: { id: 1834 } },
    ];
    expect(previousCategoriesFrom(yesterday).has("a")).toBe(false);
  });

  test("copes with no release yesterday", () => {
    expect(previousCategoriesFrom(undefined).size).toBe(0);
  });
});

describe("categoriseEntries", () => {
  beforeEach(() => {
    mockCategorise.mockReset();
    mockCategorise.mockImplementation(async (movie) => ({
      ...movie,
      category: "movie",
    }));
  });

  test("hands each listing its own category from yesterday", async () => {
    await categoriseEntries(
      [{ showingId: "a" }, { showingId: "b" }],
      [{ showingId: "a", category: "talk" }],
    );
    expect(mockCategorise).toHaveBeenCalledWith(
      { showingId: "a" },
      { previousCategory: "talk" },
    );
    expect(mockCategorise).toHaveBeenCalledWith(
      { showingId: "b" },
      { previousCategory: undefined },
    );
  });
});
