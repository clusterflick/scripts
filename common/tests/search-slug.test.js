const { getSearchSlug } = require("../utils");

// The slug stands in for a search term in a cache key, so the only thing that
// matters is that two different terms never produce the same one. Titles
// written in a non-latin script are where that breaks: slugify keeps nothing
// of them.

describe("getSearchSlug", () => {
  it.each([
    ["Wicked: For Good", "wicked-for-good"],
    ["Spider-Man: No Way Home", "spider-man-no-way-home"],
    ["CatVideoFest 2026", "catvideofest-2026"],
  ])("slugifies %j as it always has", (term, expected) => {
    expect(getSearchSlug(term)).toBe(expected);
  });

  it.each(["엔하이픈 브이알콘서트 : 데스티니", "呪術廻戦", "日本", ":", ""])(
    "gives %j something usable to be keyed by",
    (term) => {
      expect(getSearchSlug(term)).toMatch(/^[a-f0-9]{16}$/);
    },
  );

  it("keeps terms that slugify to nothing apart from each other", () => {
    const slugs = ["엔하이픈", "呪術廻戦", "日本", ""].map(getSearchSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("gives the same term the same slug every time", () => {
    expect(getSearchSlug("呪術廻戦")).toBe(getSearchSlug("呪術廻戦"));
  });
});
