const { convertDurationStringToMinutes } = require("../utils");

describe("convertDurationStringToMinutes", () => {
  it("returns undefined when there is no duration", () => {
    expect(convertDurationStringToMinutes(undefined)).toBeUndefined();
    expect(convertDurationStringToMinutes("")).toBeUndefined();
  });

  describe("hours and minutes", () => {
    it.each([
      ["1hr 33mins", 93],
      ["1hr 16 mins", 76],
      ["1 hr 50 min", 110],
      ["1 hour 52 min", 112],
      ["2hrs 13mins", 133],
      ["2hr 05mins", 125],
    ])("parses %s", (input, expected) => {
      expect(convertDurationStringToMinutes(input)).toBe(expected);
    });
  });

  describe("minutes only", () => {
    it.each([
      ["45mins", 45],
      ["90 mins", 90],
      ["61mins", 61],
    ])("parses %s", (input, expected) => {
      expect(convertDurationStringToMinutes(input)).toBe(expected);
    });
  });

  describe("estimates", () => {
    it.each([
      ["Approx 75 mins", 75],
      ["Approx. 75 mins", 75],
      ["Approximately 75 mins", 75],
      ["Approx. 2hrs 13mins", 133],
      ["Programme length: 90 mins", 90],
      ["Programme length: Approx. 90 mins", 90],
    ])("parses %s", (input, expected) => {
      expect(convertDurationStringToMinutes(input)).toBe(expected);
    });
  });

  it("throws on a format it does not recognise", () => {
    expect(() => convertDurationStringToMinutes("two hours")).toThrow(
      'Unrecognised duration format: "two hours"',
    );
  });
});
