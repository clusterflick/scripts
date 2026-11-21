const {
  extractEventLinks,
  isAccessCodePage,
  isMultipleDates,
  parseDateText,
} = require("../utils");

describe("isAccessCodePage", () => {
  it("recognises the access code form", () => {
    const html = `<main class="row content password_protected">
      <h2>Please enter the access code</h2>
      <form method="GET" action=""><input type="password" name="access" /></form>
    </main>`;
    expect(isAccessCodePage(html)).toBe(true);
  });

  it("does not flag an event page", () => {
    const html = `<main class="row content"><div class="detail-content">
      <div class="detail-content__description"><p>A film</p></div>
    </div></main>`;
    expect(isAccessCodePage(html)).toBe(false);
  });
});

describe("isMultipleDates", () => {
  it("recognises an event on several dates", () => {
    expect(isMultipleDates("Multiple dates and times")).toBe(true);
  });

  it("recognises an event at several times on one date", () => {
    expect(isMultipleDates("Fri 27 Nov 2026, Multiple times")).toBe(true);
  });

  it("does not flag a single showing", () => {
    expect(isMultipleDates("Mon 3 Aug 2026 7:30 PM - 10:00 PM BST")).toBe(
      false,
    );
  });
});

describe("parseDateText", () => {
  it("reads a start and an end time on the same day", () => {
    expect(parseDateText("Mon 3 Aug 2026 7:30 PM - 10:00 PM BST")).toEqual({
      start: new Date("2026-08-03T19:30:00+01:00"),
      end: new Date("2026-08-03T22:00:00+01:00"),
    });
  });

  it("reads a start with no end", () => {
    expect(parseDateText("Mon 3 Aug 2026 19:00")).toEqual({
      start: new Date("2026-08-03T19:00:00+01:00"),
      end: null,
    });
  });

  it("drops a listing with a date but no time", () => {
    expect(parseDateText("Mon 2 Nov 2026")).toBeNull();
  });

  it("drops a listing spanning several days", () => {
    expect(parseDateText("Fri 24 Jul 2026 - Sun 26 Jul 2026")).toBeNull();
    expect(
      parseDateText("Fri 24 Jul 2026 7:00 PM - Sun 26 Jul 2026"),
    ).toBeNull();
  });

  it("throws on a date line it cannot read", () => {
    expect(() => parseDateText("Sometime soon")).toThrow(
      'Unable to parse start date from date text: "Sometime soon"',
    );
  });
});

describe("extractEventLinks", () => {
  const listing = (date, dateText) => `
    <div class="events-listing__item">
      <h3 class="event__title">
        <a href="/events/mildmayclubandinstituteltd/2469748?date=${date}">
          The Mildmay Pantomime 2026
        </a>
      </h3>
      <div class="event-meta__date">${dateText}</div>
    </div>`;

  // The Mildmay Pantomime, November 2026: the first listings have one time
  // each, the later ones several, and the date picker holds all of them.
  it("needs the date picker if any listing of the event says so", () => {
    const html = [
      listing("2026-12-10", "Thu 10 Dec 2026 7:00 PM - 10:30 PM GMT"),
      listing("2026-12-11", "Fri 11 Dec 2026 7:00 PM - 10:00 PM GMT"),
      listing("2026-12-12", "Sat 12 Dec 2026 · Multiple times"),
      listing("2026-12-13", "Sun 13 Dec 2026 · Multiple times"),
    ].join("");
    expect(extractEventLinks(html)).toEqual([
      {
        eventId: "2469748",
        url: "https://www.tickettailor.com/events/mildmayclubandinstituteltd/2469748",
        hasMultipleDates: true,
      },
    ]);
  });

  it("does not need the date picker when every listing has one time", () => {
    const html = [
      listing("2026-12-10", "Thu 10 Dec 2026 7:00 PM - 10:30 PM GMT"),
      listing("2026-12-11", "Fri 11 Dec 2026 7:00 PM - 10:00 PM GMT"),
    ].join("");
    expect(extractEventLinks(html)).toEqual([
      expect.objectContaining({ eventId: "2469748", hasMultipleDates: false }),
    ]);
  });
});
