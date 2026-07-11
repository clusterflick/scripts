const { extractSearchResults } = require("../utils");

// The array is a property in a JS object literal, so it's always followed by
// another property key — mirror that shape so the extractor can find the close.
const wrapInPage = (searchResults) =>
  `<html><body><script>var data = { foo: "bar", searchResults : ${JSON.stringify(
    searchResults,
  )} , searchFilters : [] };</script></body></html>`;

describe("extractSearchResults", () => {
  it("parses the embedded searchResults array", () => {
    const rows = [
      ["id-1", "Babygirl"],
      ["id-2", "All We Imagine as Light"],
    ];
    expect(extractSearchResults(wrapInPage(rows))).toEqual(rows);
  });

  it("is not thrown off by brackets inside string values", () => {
    const rows = [["id-1", "A One and a Two [1993]", ["1", "2"]]];
    expect(extractSearchResults(wrapInPage(rows))).toEqual(rows);
  });

  it("returns an empty array when searchResults is absent", () => {
    expect(
      extractSearchResults("<html><body>no data here</body></html>"),
    ).toEqual([]);
  });

  it("returns an empty array for non-string input", () => {
    expect(extractSearchResults(undefined)).toEqual([]);
    expect(extractSearchResults(null)).toEqual([]);
  });

  it("returns an empty array when the array literal is malformed", () => {
    expect(extractSearchResults("searchResults : [ not valid , foo :")).toEqual(
      [],
    );
  });
});
