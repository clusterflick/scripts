const {
  extractPeopleNames,
  extractBracketedNames,
} = require("../extract-people");

describe("extractPeopleNames", () => {
  describe("basic extraction", () => {
    test("extracts a single person name", () => {
      expect(extractPeopleNames("A film by Martin Scorsese")).toEqual([
        "Martin Scorsese",
      ]);
    });

    test("extracts multiple person names", () => {
      expect(
        extractPeopleNames(
          "Leonardo DiCaprio and Brad Pitt star in this epic drama.",
        ),
      ).toEqual(["Leonardo DiCaprio", "Brad Pitt"]);
    });

    test("returns undefined when no people are found", () => {
      expect(
        extractPeopleNames("A film about robots and aliens"),
      ).toBeUndefined();
    });

    test("returns undefined for empty text", () => {
      expect(extractPeopleNames("")).toBeUndefined();
    });
  });

  describe("cleaning", () => {
    test("removes trailing periods from names", () => {
      expect(extractPeopleNames("Starring Tom Hanks.")).toEqual(["Tom Hanks"]);
    });

    test("removes trailing commas from names", () => {
      expect(extractPeopleNames("Starring Tom Hanks, with Meg Ryan")).toEqual([
        "Tom Hanks",
        "Meg Ryan",
      ]);
    });

    test("removes trailing question marks from names", () => {
      expect(extractPeopleNames("Is it Tom Hanks?")).toEqual(["Tom Hanks"]);
    });

    test("removes possessive 's from names", () => {
      expect(
        extractPeopleNames(
          "Spike Lee's latest film is a masterpiece starring Denzel Washington",
        ),
      ).toEqual(["Spike Lee", "Denzel Washington"]);
    });

    test("removes curly possessive \u2019s from names", () => {
      expect(
        extractPeopleNames(
          "Spike Lee\u2019s latest film is a masterpiece starring Denzel Washington",
        ),
      ).toEqual(["Spike Lee", "Denzel Washington"]);
    });

    test("filters out names that still contain possessives after cleaning", () => {
      const result = extractPeopleNames(
        "Leonardo DiCaprio stars in this film. Steven Spielberg\u2019s direction is impeccable.",
      );
      expect(result).toContain("Leonardo DiCaprio");
    });
  });

  describe("deduplication", () => {
    test("removes duplicate names", () => {
      expect(
        extractPeopleNames(
          "Tom Hanks stars alongside Tom Hanks in a dual role",
        ),
      ).toEqual(["Tom Hanks"]);
    });
  });

  describe("stripAttributions option", () => {
    test("strips 'directed by' lines", () => {
      expect(
        extractPeopleNames(
          "Directed by Christopher Nolan\nLeonardo DiCaprio stars in this thriller.",
          { stripAttributions: true },
        ),
      ).toEqual(["Leonardo DiCaprio"]);
    });

    test("strips 'by' lines", () => {
      expect(
        extractPeopleNames(
          "by Arthur Miller\nTom Hanks stars in this classic tale.",
          { stripAttributions: true },
        ),
      ).toEqual(["Tom Hanks"]);
    });

    test("strips 'written by' lines", () => {
      expect(
        extractPeopleNames(
          "Written by Aaron Sorkin\nBrad Pitt leads a star-studded cast.",
          { stripAttributions: true },
        ),
      ).toEqual(["Brad Pitt"]);
    });

    test("strips 'adapted by' lines", () => {
      expect(
        extractPeopleNames(
          "Adapted by Tony Kushner\nSteven Spielberg directs this story.",
          { stripAttributions: true },
        ),
      ).toEqual(["Steven Spielberg"]);
    });

    test("strips 'design by' lines", () => {
      expect(
        extractPeopleNames(
          "Design by Anna Fleischle\nMark Rylance delivers a stunning performance.",
          { stripAttributions: true },
        ),
      ).toEqual(["Mark Rylance"]);
    });

    test("strips parenthetical content", () => {
      expect(
        extractPeopleNames(
          "Tom Hanks (Breaking Bad) delivers an incredible performance.",
          { stripAttributions: true },
        ),
      ).toEqual(["Tom Hanks"]);
    });

    test("strips attribution lines case-insensitively", () => {
      expect(
        extractPeopleNames("DIRECTED BY Christopher Nolan\nTom Hardy stars.", {
          stripAttributions: true,
        }),
      ).toEqual(["Tom Hardy"]);
    });

    test("does not strip attributions by default", () => {
      const result = extractPeopleNames(
        "Directed by Christopher Nolan\nLeonardo DiCaprio stars in this thriller.",
      );
      expect(result).toContain("Christopher Nolan");
      expect(result).toContain("Leonardo DiCaprio");
    });
  });
});

describe("extractBracketedNames", () => {
  test("extracts character name from 'Actor (Character)' format", () => {
    expect(
      extractBracketedNames(
        "Ryan Gosling (Ken) and Margot Robbie (Barbie) star in this film.",
      ),
    ).toEqual(["Ken", "Barbie"]);
  });

  test("returns undefined when no bracketed names are found", () => {
    expect(
      extractBracketedNames("Tom Hanks stars in this drama."),
    ).toBeUndefined();
  });

  test("returns undefined when no people are found", () => {
    expect(extractBracketedNames("A film about robots.")).toBeUndefined();
  });

  test("returns undefined for empty text", () => {
    expect(extractBracketedNames("")).toBeUndefined();
  });

  test("ignores people without bracketed names", () => {
    expect(
      extractBracketedNames(
        "Ryan Gosling (Ken) stars alongside Tom Hanks in this drama.",
      ),
    ).toEqual(["Ken"]);
  });
});
