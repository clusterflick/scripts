const normalizeTitle = require("../normalize-title");
const testTitles = require("./test-titles.json");

describe("Normalise Title", () => {
  test.each(testTitles)(
    "normalizes the title '$input'",
    ({ input, output }) => {
      expect(normalizeTitle(input)).toBe(output);
      expect(normalizeTitle(input).length).toBeGreaterThan(0);
    },
  );
});

// The search asks for the year a Met listing names, so it can tell a revival
// from the archive production of the same name. Everything else gets the
// title without it, which is what test-titles.json covers.
describe("Normalise Title, retaining the year", () => {
  test.each([
    {
      input: "Met Opera 2026-27: Manon",
      output: "metropolitan opera manon (2026)",
    },
    {
      input: "Met Opera Live 2026-27: Samson et Dalila",
      output: "metropolitan opera samson et dalila (2026)",
    },
    {
      input: "The Met: Live in HD 24-25: Il Barbiere di Siviglia",
      output: "metropolitan opera il barbiere di siviglia (2024)",
    },
    {
      input: "RBO CINEMA SEASON 2025-2026: THE MET OPERA - EUGENE ONEGIN",
      output: "metropolitan opera eugene onegin (2025)",
    },
    {
      input: "Tristan Und Isolde - Met Opera 2026",
      output: "metropolitan opera tristan isolde (2026)",
    },
    {
      input: "Met Opera Live: Fidelio (2025)",
      output: "metropolitan opera fidelio (2025)",
    },
    // A year the venue gives wins over the season
    {
      input: "Met Opera 2026-27: Manon (2027)",
      output: "metropolitan opera manon (2027)",
    },
    // No season, no year
    {
      input: "The Metropolitan Opera: Manon",
      output: "metropolitan opera manon",
    },
  ])("normalizes the title '$input'", ({ input, output }) => {
    expect(normalizeTitle(input, { retainYear: true })).toBe(output);
  });
});
