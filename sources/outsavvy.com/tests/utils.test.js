const {
  parseDate,
  parseBookingWidgetDates,
  parseEventDates,
} = require("../utils");

// The recorded run covers the one date shape the site publishes when every
// ticket for an event starts at the same time. These exercise the rest
// directly, using the wording taken from events that don't.

const widgetScript = (dates) => `var jsonDates = ${JSON.stringify(dates)}`;

describe("parseDate", () => {
  it("reads the date out of the header", () => {
    expect(parseDate("Monday 3rd November 2025 at 7:30 PM")).toEqual(
      new Date("2025-11-03T19:30:00Z"),
    );
  });

  it("can't read a header published without a time", () => {
    expect(
      parseDate("Saturday 19th September 2026 at various times").getTime(),
    ).toBeNaN();
  });
});

describe("parseBookingWidgetDates", () => {
  it("reads the dates the widget is built from", () => {
    expect(
      parseBookingWidgetDates(
        widgetScript([
          { DisplayDate: "Saturday 19th September 2026  @ 8:00 PM" },
        ]),
      ),
    ).toEqual([new Date("2026-09-19T19:00:00Z")]);
  });

  it("reads every date of an event running over several", () => {
    expect(
      parseBookingWidgetDates(
        widgetScript([
          { DisplayDate: "Saturday 19th September 2026  @ 8:00 PM" },
          { DisplayDate: "Sunday 20th September 2026  @ 6:30 PM" },
        ]),
      ),
    ).toEqual([
      new Date("2026-09-19T19:00:00Z"),
      new Date("2026-09-20T17:30:00Z"),
    ]);
  });

  it("returns nothing when the page has no widget dates", () => {
    expect(parseBookingWidgetDates("var somethingElse = []")).toEqual([]);
  });

  // The widget titles itself from the time picked rather than the date's own
  // DisplayDate, so that text isn't the event's start to read
  it("returns nothing when a date offers times of its own", () => {
    expect(
      parseBookingWidgetDates(
        widgetScript([
          {
            DisplayDate: "Saturday 19th September 2026  @ 8:00 PM",
            Times: [
              {
                Time: "8:00 PM",
                DisplayDate: "Saturday 19th September 2026  @ 8:00 PM",
              },
              {
                Time: "8:30 PM",
                DisplayDate: "Saturday 19th September 2026  @ 8:30 PM",
              },
            ],
          },
        ]),
      ),
    ).toEqual([]);
  });

  // Half of a multi-date event's dates is a worse answer than none of them
  it("returns nothing when only some of the dates can be read", () => {
    expect(
      parseBookingWidgetDates(
        widgetScript([
          { DisplayDate: "Saturday 19th September 2026  @ 8:00 PM" },
          { DisplayDate: "whenever we get round to it" },
        ]),
      ),
    ).toEqual([]);
  });
});

describe("parseEventDates", () => {
  it("takes the header where it can be read", () => {
    expect(
      parseEventDates(
        "Monday 3rd November 2025 at 7:30 PM",
        widgetScript([{ DisplayDate: "Monday 3rd November 2025  @ 9:00 PM" }]),
      ),
    ).toEqual([new Date("2025-11-03T19:30:00Z")]);
  });

  it("falls back to the widget for an event billed at various times", () => {
    expect(
      parseEventDates(
        "Saturday 19th September 2026 at various times",
        widgetScript([
          { DisplayDate: "Saturday 19th September 2026  @ 8:00 PM" },
        ]),
      ),
    ).toEqual([new Date("2026-09-19T19:00:00Z")]);
  });

  it("returns nothing when neither can be read", () => {
    expect(
      parseEventDates("Saturday 19th September 2026 at various times", ""),
    ).toEqual([]);
  });
});
