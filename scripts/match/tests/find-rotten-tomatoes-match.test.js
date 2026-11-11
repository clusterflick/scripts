const fs = require("node:fs");
const path = require("node:path");
const { parseMoviePage } = require("../find-rotten-tomatoes-match");

const harakiri = fs.readFileSync(
  path.join(__dirname, "fixtures", "rotten-tomatoes-harakiri.html"),
  "utf8",
);
const URL = "https://www.rottentomatoes.com/m/harakiri";

describe("parseMoviePage", () => {
  it("reads the Tomatometer and Popcornmeter from the scorecard", () => {
    expect(parseMoviePage(harakiri, URL)).toEqual({
      id: "b140bf70-abc3-3c32-8c7b-23495a8030f9",
      url: URL,
      audience: {
        all: {
          likes: undefined,
          dislikes: undefined,
          reviews: undefined,
          rating: 4.6,
          score: 96,
        },
        // No verified ratings: the group is there, with nothing in it
        verified: {
          likes: undefined,
          dislikes: undefined,
          reviews: undefined,
          rating: NaN,
          score: undefined,
        },
      },
      critics: {
        all: { likes: 10, dislikes: 0, reviews: 10, rating: 8.6, score: 100 },
        top: {
          likes: 3,
          dislikes: 0,
          reviews: 3,
          rating: NaN,
          score: undefined,
        },
      },
    });
  });

  it("throws on a score that isn't a percentage", () => {
    const page = harakiri.replace(
      '"scorePercent": "100%"',
      '"scorePercent": "100"',
    );
    expect(() => parseMoviePage(page, URL)).toThrow(
      'Unrecognised Rotten Tomatoes score "100"',
    );
  });
});
