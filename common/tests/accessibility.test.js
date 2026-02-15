const { createAccessibility } = require("../utils");

describe("createAccessibility", () => {
  describe("title-based detection", () => {
    test.each([
      ["AD: The Wild Robot", { audioDescription: true }],
      ["The Wild Robot (AD)", { audioDescription: true }],
      ["Audio Described: The Wild Robot", { audioDescription: true }],
      ["The Wild Robot (Audio Description)", { audioDescription: true }],
    ])("detects audioDescription from title '%s'", (title, expected) => {
      expect(createAccessibility(title, {})).toEqual(expected);
    });

    test.each([
      ["Relaxed Screening: The Wild Robot", { relaxed: true }],
      ["Relaxed Preview: The Wild Robot", { relaxed: true }],
      ["Relaxed The Wild Robot", { relaxed: true }],
      ["The Wild Robot (Relaxed)", { relaxed: true }],
    ])("detects relaxed from title '%s'", (title, expected) => {
      expect(createAccessibility(title, {})).toEqual(expected);
    });

    test.each([
      ["Parent & Baby: The Wild Robot", { babyFriendly: true }],
      ["Parents + Baby: The Wild Robot", { babyFriendly: true }],
      ["Baby & 1: The Wild Robot", { babyFriendly: true }],
      ["Kids Club: The Wild Robot", { babyFriendly: true }],
      ["Babykino: The Wild Robot", { babyFriendly: true }],
    ])("detects babyFriendly from title '%s'", (title, expected) => {
      expect(createAccessibility(title, {})).toEqual(expected);
    });

    test.each([
      ["The Wild Robot - Subtitled", { subtitled: true }],
      ["Subtitled: The Wild Robot", { subtitled: true }],
      ["The Wild Robot (Subbed)", { subtitled: true }],
      ["The Wild Robot (Sub)", { subtitled: true }],
      ["The Wild Robot with Subtitles", { subtitled: true }],
    ])("detects subtitled from title '%s'", (title, expected) => {
      expect(createAccessibility(title, {})).toEqual(expected);
    });

    test.each([
      ["Captioned: The Wild Robot", { hardOfHearing: true }],
      ["The Wild Robot (Caption)", { hardOfHearing: true }],
      ["The Wild Robot HOH", { hardOfHearing: true }],
      ["The Wild Robot (HoH)", { hardOfHearing: true }],
      ["Hard of Hearing: The Wild Robot", { hardOfHearing: true }],
      ["The Wild Robot SDH", { hardOfHearing: true }],
      ["The Wild Robot BSL", { hardOfHearing: true }],
      ["The Wild Robot CC", { hardOfHearing: true }],
      ["The Wild Robot OC", { hardOfHearing: true }],
    ])("detects hardOfHearing from title '%s'", (title, expected) => {
      expect(createAccessibility(title, {})).toEqual(expected);
    });

    test("returns empty object for regular titles", () => {
      expect(createAccessibility("The Wild Robot", {})).toEqual({});
    });

    test("detects multiple accessibility features from one title", () => {
      expect(
        createAccessibility("Relaxed Subtitled: The Wild Robot", {}),
      ).toEqual({
        relaxed: true,
        subtitled: true,
      });
    });
  });

  describe("listing data takes precedence", () => {
    test("explicit listing data overrides title detection", () => {
      expect(
        createAccessibility("Subtitled: The Wild Robot", {
          subtitled: true,
          audioDescription: true,
        }),
      ).toEqual({
        subtitled: true,
        audioDescription: true,
      });
    });

    test("ignores false values in listing data", () => {
      expect(
        createAccessibility("The Wild Robot", {
          subtitled: false,
          audioDescription: true,
        }),
      ).toEqual({
        audioDescription: true,
      });
    });
  });

  describe("description-based detection", () => {
    test("detects subtitled from description", () => {
      expect(
        createAccessibility(
          "The Wild Robot",
          {},
          "Shown with english subtitles",
        ),
      ).toEqual({ subtitled: true });
    });

    test("detects audio description from description", () => {
      expect(
        createAccessibility(
          "The Wild Robot",
          {},
          "This screening includes audio description for visually impaired viewers",
        ),
      ).toEqual({ audioDescription: true });
    });

    test("does not detect audio description when negated in description", () => {
      expect(
        createAccessibility(
          "The Wild Robot",
          {},
          "this film screening does not have closed captions or audio description available",
        ),
      ).toEqual({});
    });

    test("detects relaxed from description", () => {
      expect(
        createAccessibility(
          "The Wild Robot",
          {},
          "This is a relaxed screening with lower volume",
        ),
      ).toEqual({ relaxed: true });
    });

    test("detects baby friendly from description", () => {
      expect(
        createAccessibility(
          "The Wild Robot",
          {},
          "A parent and baby screening with pram parking",
        ),
      ).toEqual({ babyFriendly: true });
    });

    test("detects hard of hearing from description", () => {
      expect(
        createAccessibility(
          "The Wild Robot",
          {},
          "Shown with captions for the hearing impaired",
        ),
      ).toEqual({ hardOfHearing: true });
    });

    test("title detection takes precedence over description", () => {
      expect(
        createAccessibility(
          "AD: The Wild Robot",
          {},
          "Shown with english subtitles",
        ),
      ).toEqual({ audioDescription: true, subtitled: true });
    });

    test("listing data takes precedence over description", () => {
      expect(
        createAccessibility("The Wild Robot", { relaxed: true }, ""),
      ).toEqual({ relaxed: true });
    });

    test("handles empty description", () => {
      expect(createAccessibility("The Wild Robot", {})).toEqual({});
    });
  });

  describe("audioDescription title matcher does not false-positive", () => {
    test("does not match lowercase 'ad' in words", () => {
      expect(createAccessibility("The Adventures of Tintin", {})).toEqual({});
    });

    test("does not match 'Bad Boys'", () => {
      expect(createAccessibility("Bad Boys", {})).toEqual({});
    });
  });
});
