const { parseTitleAndClassification } = require("../utils");

describe("parseTitleAndClassification", () => {
  test.each([
    ["Harvest (18)", { title: "Harvest", classification: "18" }],
    [
      "The Juniper Tree (15)",
      { title: "The Juniper Tree", classification: "15" },
    ],
    ["Some Film (U)", { title: "Some Film", classification: "U" }],
    ["Some Film (PG)", { title: "Some Film", classification: "PG" }],
    ["Some Film (12)", { title: "Some Film", classification: "12" }],
    ["Some Film (12A)", { title: "Some Film", classification: "12A" }],
  ])("strips a trailing certificate from '%s'", (input, expected) => {
    expect(parseTitleAndClassification(input)).toEqual(expected);
  });

  it("keeps any prefix that precedes the certificate", () => {
    expect(
      parseTitleAndClassification("MUBI Screening + intro: Harvest (18)"),
    ).toEqual({
      title: "MUBI Screening + intro: Harvest",
      classification: "18",
    });
  });

  it("returns no classification when there is no trailing parenthetical", () => {
    expect(parseTitleAndClassification("Alcarràs")).toEqual({
      title: "Alcarràs",
    });
  });

  test.each([
    ["Blade Runner (2049)"], // a year, not a certificate
    ["Film (Director's Cut)"], // a descriptor
    ["Film (pg)"], // lowercase isn't a recognised certificate token
  ])("leaves non-certificate trailing parens untouched in '%s'", (input) => {
    expect(parseTitleAndClassification(input)).toEqual({ title: input });
  });
});
