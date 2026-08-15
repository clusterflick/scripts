const normalizeVenueName = require("../normalize-venue-name");

describe("normalizeVenueName", () => {
  test("drops a bracketed screen number", () => {
    expect(normalizeVenueName("The Garden Cinema (Screen 3)")).toEqual(
      normalizeVenueName("The Garden Cinema"),
    );
  });

  test("drops a dashed screen number", () => {
    expect(normalizeVenueName("Rich Mix - Screen 2")).toEqual(
      normalizeVenueName("Rich Mix"),
    );
  });

  test("drops a screen number with no separator", () => {
    expect(normalizeVenueName("Everyman Screen 12")).toEqual(
      normalizeVenueName("Everyman"),
    );
  });

  test("keeps venues named after a screen with no number", () => {
    expect(normalizeVenueName("Everyman Screen on the Green")).toEqual(
      "everymanscreenonthegreen",
    );
    expect(normalizeVenueName("The Soho Screening Rooms")).toEqual(
      "sohoscreeningrooms",
    );
    expect(normalizeVenueName("Canary Wharf Summer Screens")).toEqual(
      "canarywharfsummerscreens",
    );
  });
});
