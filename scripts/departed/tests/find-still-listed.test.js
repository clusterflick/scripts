const { indexUnmatchedByTitle } = require("../find-still-listed");

const unmatched = (title, normalizedTitle) => ({
  title,
  normalizedTitle,
  isUnmatched: true,
});

const matched = (title, normalizedTitle) => ({ title, normalizedTitle });

describe("indexUnmatchedByTitle", () => {
  it("indexes an unmatched listing by its normalised title", () => {
    const index = indexUnmatchedByTitle({
      "7fc1f2ab": unmatched("Antarctica (U)", "antarctica"),
    });

    expect(index.get("antarctica")).toEqual({
      id: "7fc1f2ab",
      title: "Antarctica (U)",
    });
  });

  // A matched movie sharing a title is a different film - the 1927 and 2001
  // Metropolis - so suggesting it would be worse than suggesting nothing.
  it("ignores movies that have a TheMovieDB match", () => {
    const index = indexUnmatchedByTitle({
      19: matched("Metropolis", "metropolis"),
    });

    expect(index.size).toBe(0);
  });

  it("drops a title claimed by more than one unmatched listing", () => {
    const index = indexUnmatchedByTitle({
      aaa: unmatched("Halloween", "halloween"),
      bbb: unmatched("Halloween (18)", "halloween"),
    });

    expect(index.has("halloween")).toBe(false);
  });

  it("skips listings with no normalised title", () => {
    const index = indexUnmatchedByTitle({
      aaa: { title: "Mystery", isUnmatched: true },
    });

    expect(index.size).toBe(0);
  });

  it("keeps unrelated unmatched listings apart", () => {
    const index = indexUnmatchedByTitle({
      aaa: unmatched("Antarctica (U)", "antarctica"),
      bbb: unmatched("Sing Street", "sing street"),
    });

    expect(index.size).toBe(2);
    expect(index.get("sing street").title).toBe("Sing Street");
  });
});
