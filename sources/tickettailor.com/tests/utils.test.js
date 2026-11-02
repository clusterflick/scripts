const { isAccessCodePage, parseDateText } = require("../utils");

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
