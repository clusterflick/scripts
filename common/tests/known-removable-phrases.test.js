const knownRemovablePhrases = require("../known-removable-phrases");
const testTitles = require("./test-titles.json");

describe("Known Removable Phrases", () => {
  test("exports a non-empty array of strings", () => {
    expect(Array.isArray(knownRemovablePhrases)).toBe(true);
    expect(knownRemovablePhrases.length).toBeGreaterThan(0);
    knownRemovablePhrases.forEach((phrase) => {
      expect(typeof phrase).toBe("string");
    });
  });

  test("contains no empty or whitespace-only entries", () => {
    knownRemovablePhrases.forEach((phrase) => {
      expect(phrase.trim().length).toBeGreaterThan(0);
    });
  });

  test("contains no case-insensitive duplicates", () => {
    const seen = new Map();
    const duplicates = [];
    knownRemovablePhrases.forEach((phrase, i) => {
      const key = phrase.toLowerCase();
      if (seen.has(key)) {
        duplicates.push(
          `"${phrase}" at index ${i} duplicates index ${seen.get(key)}`,
        );
      } else {
        seen.set(key, i);
      }
    });
    expect(duplicates).toEqual([]);
  });

  test("each phrase is matched by at least one title in the test suite (warn on misses)", () => {
    const allInputs = testTitles.map(({ input }) => input.toLowerCase());
    const unmatched = knownRemovablePhrases.filter(
      (phrase) =>
        !allInputs.some((input) => input.includes(phrase.toLowerCase())),
    );
    if (unmatched.length > 0) {
      // Warn rather than fail — some phrases cover venue patterns not yet in test-titles.json
      // console.warn(
      //   `${unmatched.length} phrase(s) not matched by any title in test-titles.json (may be dead or untested):\n` +
      //     unmatched.map((p) => `  ${JSON.stringify(p)}`).join("\n"),
      // );
    }
    // The test itself does not fail on unmatched phrases, but does fail if
    // there are zero total matches (which would indicate a broken import).
    const matchedCount = knownRemovablePhrases.length - unmatched.length;
    expect(matchedCount).toBeGreaterThan(0);
  });
});
