const fs = require("node:fs");
const path = require("node:path");
const { parseScore } = require("../find-letterboxd-match");

const readFixture = (name) =>
  fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");

const ratings = readFixture("letterboxd-clockwork-ratings.html");
const stats = readFixture("letterboxd-clockwork-stats.html");
const url = "https://letterboxd.com/film/a-clockwork-orange/";

describe("parseScore", () => {
  it("extracts the weighted rating, review count and likes", () => {
    expect(parseScore({ url, ratings, stats })).toEqual({
      url,
      likes: 1210433,
      reviews: 1456404, // matches "based on 1,456,404 ratings"
      rating: 4.1,
      unweightedRating: 4.07,
    });
  });

  it("returns empty rating data when the ratings section is absent", () => {
    expect(parseScore({ url, ratings: "", stats })).toEqual({
      url,
      likes: 1210433,
      reviews: 0,
      rating: undefined,
      unweightedRating: null,
    });
  });

  it("throws when the ratings section is present but the bars cannot be parsed", () => {
    const staleRatings =
      '<section class="ratings-histogram-chart"><div class="rating-histogram">no bars here</div></section>';
    expect(() => parseScore({ url, ratings: staleRatings, stats })).toThrow(
      /selectors are likely stale/,
    );
  });

  it("throws when the histogram parses but the average rating cannot", () => {
    // Drop the `averagerating` class so only the average selector breaks.
    const ratingsWithoutAverage = ratings.replace(
      "averagerating tooltip",
      "tooltip",
    );
    expect(() =>
      parseScore({ url, ratings: ratingsWithoutAverage, stats }),
    ).toThrow(/rating=undefined/);
  });
});
