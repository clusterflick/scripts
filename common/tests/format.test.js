const { createFormat, getValidFormat } = require("../utils");

describe("getValidFormat", () => {
  test.each([
    ["70mm", { source: "70mm" }],
    ["70 mm", { source: "70mm" }],
    ["35mm", { source: "35mm" }],
    ["16mm", { source: "16mm" }],
    ["VHS", { source: "vhs" }],
    ["LaserDisc", { source: "laserdisc" }],
    ["laser disc", { source: "laserdisc" }],
    ["Nitrate", { source: "nitrate" }],
    ["IMAX", { presentation: "imax" }],
    ["4DX", { presentation: "4dx" }],
    ["4-dx", { presentation: "4dx" }],
    ["ScreenX", { presentation: "screenx" }],
    ["screen x", { presentation: "screenx" }],
    ["Dolby Cinema", { presentation: "dolby-cinema" }],
    ["dolby-cinema", { presentation: "dolby-cinema" }],
    ["3D", { dimension: "3d" }],
    ["2D", { dimension: "2d" }],
  ])("classifies token '%s'", (value, expected) => {
    expect(getValidFormat(value)).toEqual(expected);
  });

  test.each([
    ["4k"],
    ["2k"],
    ["dcp"],
    ["dolby-atmos"],
    ["d-box"],
    ["super-8"],
    ["65mm"],
    ["vistavision"],
    [""],
    [undefined],
  ])("drops unsupported token '%s'", (value) => {
    expect(getValidFormat(value)).toEqual({});
  });
});

describe("createFormat", () => {
  describe("title-based detection", () => {
    test.each([
      ["The Brutalist (70mm)", { source: "70mm" }],
      ["Nosferatu 35mm", { source: "35mm" }],
      ["Eraserhead (1977) on 16mm", { source: "16mm" }],
      ["Blonde Death (ON VHS)", { source: "vhs" }],
      ["(IMAX) The Odyssey", { presentation: "imax" }],
      ["(4DX) Moana 2", { presentation: "4dx" }],
      ["ScreenX Fest : F1 The Movie", { presentation: "screenx" }],
      ["Top Gun Dolby Cinema Double Bill", { presentation: "dolby-cinema" }],
    ])("detects format from title '%s'", (title, expected) => {
      expect(createFormat(title)).toEqual(expected);
    });

    test("does not read the venue name 'BFI IMAX' as an IMAX format", () => {
      expect(
        createFormat("Member Exclusive: BFI Southbank and BFI IMAX Tour"),
      ).toEqual({});
    });

    test("returns empty object for a standard-digital title", () => {
      expect(createFormat("The Wild Robot")).toEqual({});
    });

    test("captures both axes from one title (IMAX 70mm)", () => {
      expect(createFormat("The Odyssey - IMAX 70mm")).toEqual({
        source: "70mm",
        presentation: "imax",
      });
    });
  });

  describe("listing data takes precedence", () => {
    test("structured listing data wins over the title", () => {
      expect(createFormat("The Odyssey (70mm)", { source: "35mm" })).toEqual({
        source: "35mm",
      });
    });

    test("combines a listing presentation with a title source", () => {
      expect(
        createFormat("The Odyssey (70mm)", { presentation: "IMAX" }),
      ).toEqual({ source: "70mm", presentation: "imax" });
    });

    test("drops listing values that are not valid for their axis", () => {
      expect(
        createFormat("The Wild Robot", {
          source: "imax",
          presentation: "70mm",
        }),
      ).toEqual({});
    });
  });

  describe("dimension (2d/3d)", () => {
    test("captured from structured listing data", () => {
      expect(createFormat("Avatar", { dimension: "3d" })).toEqual({
        dimension: "3d",
      });
    });

    test("combines with source and presentation on one screening", () => {
      expect(
        createFormat("Avatar (70mm)", {
          presentation: "imax",
          dimension: "3d",
        }),
      ).toEqual({ source: "70mm", presentation: "imax", dimension: "3d" });
    });

    test.each([
      ["Captain America: Brave New World (3D)", { dimension: "3d" }],
      ["Star Wars: The Mandalorian and Grogu (3D)", { dimension: "3d" }],
      ["Space: The New Frontier ( 3D )", { dimension: "3d" }],
      ["Avatar (2D)", { dimension: "2d" }],
    ])(
      "is read from a parenthetical (3D)/(2D) qualifier in '%s'",
      (title, expected) => {
        expect(createFormat(title)).toEqual(expected);
      },
    );

    test.each([
      // Bare "3D" that is part of a film's name, not a screening qualifier.
      ["Piranha 3D"],
      ["Step Up 3D"],
      // A pun, not a 3D screening.
      ["Mark Kermode Live in 3D at the BFI"],
    ])("is NOT inferred from a bare '3D' in '%s'", (title) => {
      expect(createFormat(title)).toEqual({});
    });
  });

  describe("description-based detection", () => {
    test.each([
      ["A brand new 70mm print, presented for one night only.", "70mm"],
      ["Our main film, which will be projected on 16mm film.", "16mm"],
      ["A 35mm presentation in association with the archive.", "35mm"],
      ["Screened on a rare 35mm print from the BFI archive.", "35mm"],
    ])(
      "detects a source when there is an exhibition cue (%s)",
      (description, expected) => {
        expect(createFormat("A Film", {}, description).source).toBe(expected);
      },
    );

    test.each([
      // How it was made / its medium - never a screening format.
      ["Beautifully shot on 35mm by the director."],
      ["The film was photographed in 16mm."],
      ["Drawing on the director's own Super 8 and 35mm footage."],
      ["With striking 16mm cinematography, this Nordic thriller stuns."],
      // Real-world data even had the typo "cinemtatography".
      ["With striking 16mm cinemtatography, this stylish thriller stuns."],
      ["Shot on lush 16mm and attuned to the forest's hush."],
      ["Moments immortalized on 8mm and 16mm film."],
      ["The inner workings of the 16mm Bolex Camera."],
      ["A new 65mm negative was struck for the shoot."],
    ])("ignores non-exhibition film mentions (%s)", (description) => {
      const result = createFormat("A Film", {}, description);
      expect(result.source).toBeUndefined();
    });

    test("the title still wins over a mention in the description", () => {
      expect(
        createFormat("Sinners (70mm)", {}, "Originally shot on 35mm film."),
      ).toEqual({ source: "70mm" });
    });
  });
});
