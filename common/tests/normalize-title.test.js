const normalizeTitle = require("../normalize-title");
const testTitles = require("./test-titles.json");

describe("Normalise Title", () => {
  jest.useFakeTimers().setSystemTime(new Date("2025-06-15"));

  test.each(testTitles)(
    "normalizes the title '$input'",
    ({ input, output }) => {
      expect(normalizeTitle(input)).toBe(output);
      expect(normalizeTitle(input).length).toBeGreaterThan(0);
    },
  );
});
