const normalizeTitle = require("../normalize-title");
const testTitles = require("./test-titles.json");

describe("Normalise Title", () => {
  test.each(testTitles)(
    "normalizes the title '$input'",
    ({ input, output }) => {
      expect(normalizeTitle(input)).toBe(output);
    },
  );
});
