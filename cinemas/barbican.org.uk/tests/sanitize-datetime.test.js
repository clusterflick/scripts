const cheerio = require("cheerio");
const { sanitizeDatetime } = require("../utils");

const makeTimeEl = (datetime, text) => {
  const $ = cheerio.load(
    `<time${datetime ? ` datetime="${datetime}"` : ""}>${text}</time>`,
  );
  return $("time");
};

describe("sanitizeDatetime", () => {
  describe("passthrough cases", () => {
    it("returns undefined when there is no datetime attribute", () => {
      expect(sanitizeDatetime(makeTimeEl(null, "7pm"))).toBeUndefined();
    });

    it("returns datetime unchanged when it does not end with Z", () => {
      expect(
        sanitizeDatetime(makeTimeEl("2026-03-15T19:30:00", "7.30pm")),
      ).toBe("2026-03-15T19:30:00");
    });

    it("returns datetime unchanged when the text does not match a recognisable time format", () => {
      expect(sanitizeDatetime(makeTimeEl("2026-03-15T19:30:00Z", "7:30"))).toBe(
        "2026-03-15T19:30:00Z",
      );
    });
  });

  describe("strips Z when ISO time matches text time (Z is incorrect)", () => {
    // BST (UTC+1): Barbican incorrectly marks a local BST time with Z.
    // e.g. a 7.30pm BST showing stored as 2026-07-15T19:30:00Z instead of 19:30:00 local.
    // The numeric values match so Z is stripped, giving a correct local datetime.
    it("strips Z for a BST date where Z was incorrectly applied to a local time", () => {
      expect(
        sanitizeDatetime(makeTimeEl("2026-07-15T19:30:00Z", "7.30pm")),
      ).toBe("2026-07-15T19:30:00");
    });

    it("handles pm times with dot-separated minutes", () => {
      expect(
        sanitizeDatetime(makeTimeEl("2026-03-15T19:30:00Z", "7.30pm")),
      ).toBe("2026-03-15T19:30:00");
    });

    it("handles pm times with colon-separated minutes", () => {
      expect(
        sanitizeDatetime(makeTimeEl("2026-03-15T19:30:00Z", "7:30pm")),
      ).toBe("2026-03-15T19:30:00");
    });

    it("handles pm times with no minutes", () => {
      expect(sanitizeDatetime(makeTimeEl("2026-03-15T20:00:00Z", "8pm"))).toBe(
        "2026-03-15T20:00:00",
      );
    });

    it("handles am times", () => {
      expect(
        sanitizeDatetime(makeTimeEl("2026-03-15T10:30:00Z", "10.30am")),
      ).toBe("2026-03-15T10:30:00");
    });

    it("handles 12pm (noon via pm)", () => {
      expect(sanitizeDatetime(makeTimeEl("2026-03-15T12:00:00Z", "12pm"))).toBe(
        "2026-03-15T12:00:00",
      );
    });

    it("handles 12am (midnight)", () => {
      expect(sanitizeDatetime(makeTimeEl("2026-03-15T00:00:00Z", "12am"))).toBe(
        "2026-03-15T00:00:00",
      );
    });
  });

  describe("keeps Z when ISO time does not match text time (Z is correct UTC)", () => {
    // BST (UTC+1): Barbican correctly marks a UTC time with Z.
    // e.g. a 7.30pm BST showing stored as 2026-07-15T18:30:00Z (18:30 UTC = 19:30 BST).
    // The numeric values differ (18 vs 19) so Z is kept, preserving the correct UTC datetime.
    it("keeps Z for a BST date where Z was correctly applied to a UTC time", () => {
      expect(
        sanitizeDatetime(makeTimeEl("2026-07-15T18:30:00Z", "7.30pm")),
      ).toBe("2026-07-15T18:30:00Z");
    });

    it("keeps Z when hour differs (GMT, sanity check)", () => {
      expect(
        sanitizeDatetime(makeTimeEl("2026-03-15T19:30:00Z", "8.30pm")),
      ).toBe("2026-03-15T19:30:00Z");
    });

    it("keeps Z when minutes differ", () => {
      expect(
        sanitizeDatetime(makeTimeEl("2026-03-15T19:30:00Z", "7.45pm")),
      ).toBe("2026-03-15T19:30:00Z");
    });
  });
});
