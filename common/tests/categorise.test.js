const { holdYesterdaysCategory } = require("../categorise");

// What askJevToCategorise hands back: the category it picked, plus the
// distribution it picked from.
const jevAnswer = (probabilities) => {
  const [category] = Object.entries(probabilities).sort(
    ([, a], [, b]) => b - a,
  )[0];
  return {
    title: "A listing",
    category,
    jev: { category, confidence: 0.4, probabilities },
  };
};

describe("holdYesterdaysCategory", () => {
  test("keeps yesterday's category when it is today's runner-up in a near-tie", () => {
    const today = jevAnswer({
      "multiple-movies": 0.43,
      movie: 0.42,
      event: 0.15,
    });
    expect(holdYesterdaysCategory(today, "movie").category).toBe("movie");
  });

  test("holds at exactly 20 points, which floating point puts just over", () => {
    // 0.56 - 0.36 is 0.20000000000000007
    const today = jevAnswer({
      movie: 0.56,
      "multiple-movies": 0.36,
      event: 0.08,
    });
    expect(holdYesterdaysCategory(today, "multiple-movies").category).toBe(
      "multiple-movies",
    );
  });

  test("takes today's answer once the gap is wider than a near-tie", () => {
    const today = jevAnswer({
      movie: 0.62,
      "multiple-movies": 0.3,
      event: 0.08,
    });
    expect(holdYesterdaysCategory(today, "multiple-movies").category).toBe(
      "movie",
    );
  });

  test("takes today's answer when yesterday's is not the runner-up", () => {
    const today = jevAnswer({ talk: 0.42, workshop: 0.39, event: 0.19 });
    expect(holdYesterdaysCategory(today, "event").category).toBe("talk");
  });

  test("changes nothing when yesterday's category is today's winner", () => {
    const today = jevAnswer({ shorts: 0.52, "multiple-movies": 0.45 });
    expect(holdYesterdaysCategory(today, "shorts")).toBe(today);
  });

  test("changes nothing for a listing new today", () => {
    const today = jevAnswer({ "multiple-movies": 0.54, event: 0.43 });
    expect(holdYesterdaysCategory(today, undefined)).toBe(today);
  });

  test("changes nothing when there was no distribution to break a tie in", () => {
    // A TheMovieDB match, or a listing with no description, is decided
    // without asking Jev, so there are no probabilities to compare.
    const decidedWithoutJev = { title: "Matched", category: "movie" };
    expect(holdYesterdaysCategory(decidedWithoutJev, "event")).toBe(
      decidedWithoutJev,
    );
  });

  test("keeps the distribution, so the caller can still strip it", () => {
    const today = jevAnswer({ talk: 0.42, workshop: 0.39, event: 0.19 });
    const held = holdYesterdaysCategory(today, "workshop");
    expect(held.category).toBe("workshop");
    expect(held.jev).toEqual(today.jev);
  });
});
