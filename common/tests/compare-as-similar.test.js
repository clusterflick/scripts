const { compareAsSimilar } = require("../utils");
const normalizeName = require("../normalize-name");

const compareNames = (first, second) =>
  compareAsSimilar(normalizeName(first), normalizeName(second));

describe("compareAsSimilar", () => {
  test("matches identical strings", () => {
    expect(compareAsSimilar("anglee", "anglee")).toBe(true);
  });

  // Spelling variants found in a release's worth of venue-supplied directors,
  // checked against the credits of the film each one was matched to. These are
  // what the tolerance exists for.
  describe("spelling variants of the same person", () => {
    test.each([
      ["Jane Shoenbrun", "Jane Schoenbrun"],
      ["Antony Russo", "Anthony Russo"],
      ["Zach Creggor", "Zach Cregger"],
      ["Jonathan Etzler", "Jonatan Etzler"],
      ["Julien Cheng", "Julien Chheng"],
      ["Elliott Tuttle", "Elliot Tuttle"],
      ["Kenji Fukasaku", "Kinji Fukasaku"],
      ["Dan Kwan", "Daniel Kwan"],
    ])("matches %s against %s", (venueName, creditedName) => {
      expect(compareNames(venueName, creditedName)).toBe(true);
    });
  });

  // Different people who sit close enough to have been matched under the
  // previous budget of four changes.
  describe("different people who are near neighbours", () => {
    test.each([
      ["Michael Mann", "Michael Waxman"],
      ["Jacques Tati", "Jacques Cottin"],
      ["Taghi Amirani", "Ali Amirani"],
      // Kenta is Kinji Fukasaku's son, and credited on the same films.
      ["Kenji Fukasaku", "Kenta Fukasaku"],
    ])("does not match %s against %s", (venueName, creditedName) => {
      expect(compareNames(venueName, creditedName)).toBe(false);
    });
  });

  // A name too short for the budget to mean anything is not an identity - the
  // tolerance would be most of the string. "Jane" is what the NLP left behind
  // when it split "Jane Austen's" out of a Forest Cinema synopsis, and it came
  // within the old budget of Ang Lee.
  describe("names too short to be compared loosely", () => {
    test("does not match a bare given name against a full name", () => {
      expect(compareNames("Jane", "Ang Lee")).toBe(false);
    });

    test("does not match a surname fragment against a full name", () => {
      expect(compareNames("Lee", "Ang Lee")).toBe(false);
    });

    test("still matches a short name exactly", () => {
      expect(compareNames("Ang Lee", "Ang Lee")).toBe(true);
    });
  });
});
