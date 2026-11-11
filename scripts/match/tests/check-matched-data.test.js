const checkMatchedData = require("../check-matched-data");

const rottenTomatoes = (score) => ({
  critics: { all: { score, reviews: 10 } },
  url: "https://www.rottentomatoes.com/m/harakiri",
});

describe("checkMatchedData", () => {
  it("passes when some matches carry a score", () => {
    expect(
      checkMatchedData("rottentomatoes", {
        14537: rottenTomatoes(100),
        1: rottenTomatoes(undefined),
      }),
    ).toEqual({ matched: 2, scored: 1 });
  });

  it("throws when nothing matched", () => {
    expect(() => checkMatchedData("imdb", {})).toThrow(
      "No movies matched on imdb",
    );
  });

  // What every release from 6 November 2026 looked like
  it("throws when no match carries a score", () => {
    expect(() =>
      checkMatchedData("rottentomatoes", {
        14537: rottenTomatoes(null),
        1: rottenTomatoes(NaN),
      }),
    ).toThrow(
      "None of the 2 movies matched on rottentomatoes has a score - has the source changed shape?",
    );
  });

  it("counts a Bechdel rating of 0 as a score", () => {
    expect(checkMatchedData("bechdel", { 1: { rating: 0 } })).toEqual({
      matched: 1,
      scored: 1,
    });
  });

  it("reads Metacritic's critic score", () => {
    expect(() =>
      checkMatchedData("metacritic", { 1: { audience: { rating: 7.6 } } }),
    ).toThrow("None of the 1 movies matched on metacritic has a score");
  });

  it("throws for a source it has no score for", () => {
    expect(() => checkMatchedData("unknown", { 1: {} })).toThrow(
      'No score defined for source "unknown"',
    );
  });
});
