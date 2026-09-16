const fs = require("node:fs");
const path = require("node:path");
const cheerio = require("cheerio");
const {
  parseListingEventUrls,
  parseVenueCoordinates,
  parseVenueAddress,
  assertEventsAreLocatable,
  parseDate,
  parseBookingWidgetDates,
  parseEventDates,
} = require("../utils");

// The recorded run covers the one date shape the site publishes when every
// ticket for an event starts at the same time. These exercise the rest
// directly, using the wording taken from events that don't.

const widgetScript = (dates) => `var jsonDates = ${JSON.stringify(dates)}`;

// The event grid of the "film" hashtag listing as it was served on 2026-09-14,
// trimmed to two event cards and the promotional panel that follows them.
const listingWithPromoPanel = fs.readFileSync(
  path.join(__dirname, "fixtures", "listing-with-promo-panel.html"),
  "utf8",
);

// An event page as served on 2026-09-16, keeping the location map and venue
// block the two readers below take their answers from.
const eventPage = cheerio.load(
  fs.readFileSync(path.join(__dirname, "fixtures", "folklore.html"), "utf8"),
);

describe("parseListingEventUrls", () => {
  it("reads the events listed under a hashtag", () => {
    expect(parseListingEventUrls(listingWithPromoPanel)).toEqual([
      "https://outsavvy.com/event/38590/film-everybody-to-kenmure-street-in-association-with-tower-hamlets-stand-up-to-racism",
      "https://outsavvy.com/event/39052/fringe-presents-straight-from-the-yard",
    ]);
  });

  // The panel sits in the event grid and links out with an absolute URL, so
  // taking every link in the grid and prefixing the domain asked for
  // "https://outsavvy.comhttps://www.outsavvy.com/hashtag/halloween"
  it("leaves the promotional panel OutSavvy puts in the grid", () => {
    expect(
      parseListingEventUrls(listingWithPromoPanel).join(" "),
    ).not.toContain("hashtag");
  });

  it("reads nothing out of a listing that has stopped carrying events", () => {
    expect(parseListingEventUrls('<div id="eventscontent"></div>')).toEqual([]);
  });
});

// The pair that place an event, pinned to the markup each is read from
describe("parseVenueCoordinates", () => {
  it("reads the coordinates behind the location map", () => {
    expect(parseVenueCoordinates(eventPage)).toEqual({
      lat: 51.5307,
      lon: -0.0723475,
    });
  });

  it("reads no coordinates from a page with no location map", () => {
    expect(parseVenueCoordinates(cheerio.load("<html></html>"))).toBeNull();
  });
});

describe("parseVenueAddress", () => {
  it("reads the address without the venue name or the map link", () => {
    expect(parseVenueAddress(eventPage).replace(/\s+/g, " ")).toBe(
      "186 Hackney Road, London, E2 7QL",
    );
  });
});

describe("assertEventsAreLocatable", () => {
  const url =
    "https://outsavvy.com/event/39708/interactive-b-movie-cabaret-night-american-rickshaw";
  const eventHtml = fs.readFileSync(
    path.join(__dirname, "fixtures", "folklore.html"),
    "utf8",
  );

  it("passes a sweep whose pages still say where their events are", () => {
    expect(() => assertEventsAreLocatable({ [url]: eventHtml })).not.toThrow();
  });

  it("says nothing about a sweep that found no events", () => {
    expect(() => assertEventsAreLocatable({})).not.toThrow();
  });

  // The shape the original breakage took: the map still on the page with the
  // coordinates in it, just no longer where the reader looked
  it("fails a sweep whose location maps have moved on", () => {
    const moved = eventHtml.replace(
      /MapboxHandler\.ashx/g,
      "SomeNewHandler.ashx",
    );

    expect(() => assertEventsAreLocatable({ [url]: moved })).toThrow(
      /No coordinates could be read from any of the 1 event pages swept/,
    );
  });

  it("fails a sweep whose venue blocks have moved on", () => {
    const moved = eventHtml.replace(/event-item-venue/g, "event-item-location");

    expect(() => assertEventsAreLocatable({ [url]: moved })).toThrow(
      /No venue address could be read from any of the 1 event pages swept/,
    );
  });

  // One event without a map says nothing about the markup - only a whole sweep
  // of them does
  it("passes a sweep where a single page has no map", () => {
    expect(() =>
      assertEventsAreLocatable({
        [url]: eventHtml,
        "https://outsavvy.com/event/1/no-map": "<html></html>",
      }),
    ).not.toThrow();
  });
});

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
