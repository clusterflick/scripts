const normalizeName = require("../normalize-name");

describe("normalizeName", () => {
  test("matches a typographic apostrophe against an ASCII one", () => {
    expect(normalizeName("St Matthew’s Church")).toEqual(
      normalizeName("St Matthew's Church"),
    );
  });

  test("matches typographic quotes against ASCII ones", () => {
    expect(normalizeName("‘Salem’s Lot")).toEqual(
      normalizeName("'Salem's Lot"),
    );
  });

  test("drops a leading 'the', casing, punctuation and whitespace", () => {
    expect(normalizeName("The Woodfield Pavilion")).toEqual(
      "woodfieldpavilion",
    );
  });
});
