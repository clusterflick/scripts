const cheerio = require("cheerio");
const { isOneOffEventByline, getTicketProductNames } = require("../utils");

const makeByline = (inner) =>
  cheerio.load(
    `<span class="event-byline__date"><span class="date-range">${inner}</span>,</span>`,
  );

const makeDataLayer = (contents) =>
  cheerio.load(
    `<html><head><script>${contents}</script></head><body></body></html>`,
  );

describe("isOneOffEventByline", () => {
  it("is a one-off when a single date carries a time of day", () => {
    expect(
      isOneOffEventByline(
        makeByline(
          '<time datetime="2026-08-22T19:30:00Z">Sat 22 Aug 2026, 20:30</time>',
        ),
      ),
    ).toBe(true);
  });

  // A run renders both ends of its original range and keeps doing so as dates
  // pass, so a run down to its final performance still reads as a range.
  it("is not a one-off when the byline is a date range", () => {
    expect(
      isOneOffEventByline(
        makeByline(
          '<time datetime="2026-05-29T17:00:00Z">Fri 29 May</time><span>—</span>' +
            '<time datetime="2026-07-16T19:40:00Z">Thu 16 Jul 2026</time>',
        ),
      ),
    ).toBe(false);
  });

  // One day holding two showings renders the date alone - the absence of a time
  // of day is the only thing separating it from a genuine one-off.
  it("is not a one-off when a single date carries no time of day", () => {
    expect(
      isOneOffEventByline(
        makeByline(
          '<time datetime="2026-09-23T17:00:00Z">Wed 23 Sep 2026</time>',
        ),
      ),
    ).toBe(false);
  });

  it("is not a one-off when the byline is missing", () => {
    expect(isOneOffEventByline(cheerio.load("<span></span>"))).toBe(false);
  });
});

describe("getTicketProductNames", () => {
  it("reads product names from the dataLayer", () => {
    expect(
      getTicketProductNames(
        makeDataLayer(
          'var dataLayer = [{"primary_artform":"Cinema","title":"Weathering with You","eventInfo":[{"name":"Outdoor Cinema: Weathering With You (12A) (AD & Captioned)","id":"1311601AR"}]}];',
        ),
      ),
    ).toEqual(["Outdoor Cinema: Weathering With You (12A) (AD & Captioned)"]);
  });

  it("reads every product when an event has more than one", () => {
    expect(
      getTicketProductNames(
        makeDataLayer(
          'var dataLayer = [{"title":"Backrooms","eventInfo":[{"name":"Backrooms (15) (AD)","id":"a"},{"name":"Backrooms: Everything Must Go With Bonus Footage (cert tbc) (AD)","id":"b"}]}];',
        ),
      ),
    ).toEqual([
      "Backrooms (15) (AD)",
      "Backrooms: Everything Must Go With Bonus Footage (cert tbc) (AD)",
    ]);
  });

  it("returns no names when the event has no ticketing products", () => {
    expect(
      getTicketProductNames(
        makeDataLayer('var dataLayer = [{"title":"Some Event"}];'),
      ),
    ).toEqual([]);
  });

  it("returns no names when there is no dataLayer", () => {
    expect(
      getTicketProductNames(makeDataLayer("var somethingElse = 1;")),
    ).toEqual([]);
  });
});
