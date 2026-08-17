const { extractTime, parseEventDate } = require("../utils");

// The London film searches rarely hold more than a handful of events at once,
// so the recorded run covers one shape of date and time out of the several the
// site publishes. These exercise the rest directly, using the wording taken
// from events listed under the other genres.

describe("extractTime", () => {
  it.each([
    ["Door time: 6:30pm, start time: 7:00pm", "7:00pm"],
    ["Door time: 7:15pm, Start time: 7:45pm", "7:45pm"],
    ["Door time: 7:00pm\nStart time: 7:30pm", "7:30pm"],
    // Only a door time published, so that stands in for the start
    ["Door time: 12:00pm", "12:00pm"],
    // The minutes are dropped when a time is on the hour
    ["Door time: 7pm, start time: 8pm", "8:00pm"],
  ])("reads the start time out of %j", (timeText, expected) => {
    expect(extractTime(timeText)).toBe(expected);
  });

  it("returns null when no time is published", () => {
    expect(extractTime("Door time varies - see details below")).toBe(null);
  });
});

describe("parseEventDate", () => {
  it("parses a date and time into the start of the screening", () => {
    expect(
      parseEventDate(
        "Thursday 20th August, 2026",
        "Door time: 6:30pm, start time: 7:00pm",
      ),
    ).toEqual(new Date("2026-08-20T19:00:00+01:00"));
  });

  it("takes the first day of an event running over several", () => {
    expect(
      parseEventDate(
        "Saturday 5th December, 2026 to Sunday 6th December, 2026\n(12pm - 4.30pm)",
        "Door time: 12:00pm",
      ),
    ).toEqual(new Date("2026-12-05T12:00:00Z"));
  });

  it("returns null when no time is published", () => {
    expect(
      parseEventDate(
        "Thursday 20th August, 2026",
        "Door time varies - see details below",
      ),
    ).toBe(null);
  });

  it("throws when the date can't be parsed", () => {
    expect(() =>
      parseEventDate("Thursday 20th of August 2026", "start time: 7:00pm"),
    ).toThrow("Failed to parse date");
  });
});
